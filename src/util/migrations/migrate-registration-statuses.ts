import mongoose from 'mongoose';
import { RegistrationSchema } from 'src/registration/schemas/registration.schema';
import { UserSchema } from 'src/user/schemas/user.schema';
import { VerificationStatus } from 'src/constants/verification-status.enum';

const Registration = mongoose.model('registrations', RegistrationSchema);
const User = mongoose.model('users', UserSchema);

type LegacyStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'notReserved'
  | 'cancelled'
  | 'refundProcessing'
  | 'refunded'
  | 'completed'
  | 'didntPick'
  | 'confirmed'
  | 'new'
  | 'waitlisted'
  | 'onboarding'
  | 'payment'
  | 'confirmed';

const isVerified = (user: any) =>
  user?.verification?.status === VerificationStatus.VERIFIED;

export async function migrateRegistrationStatuses() {
  await mongoose.connect(process.env.MONGO_URI as string);

  const regs = await Registration.find({}).lean();
  const userIds = Array.from(
    new Set(regs.map((r: any) => String(r.userId || r.user)))
  );
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id verification')
    .lean();
  const userById = new Map(users.map((u: any) => [String(u._id), u]));

  const bulk = [] as any[];

  for (const reg of regs as any[]) {
    const legacyStatus = String(reg.status || 'pending') as LegacyStatus;
    const user = userById.get(String(reg.userId || reg.user));
    const verified = isVerified(user);

    const price = typeof reg.price === 'number' ? reg.price : 0;
    const amountDue = typeof reg.amountDue === 'number' ? reg.amountDue : price;
    const hasApprovedPayment = price > 0 && amountDue < price;

    let nextStatus: 'new' | 'waitlisted' | 'onboarding' | 'payment' | 'confirmed' = 'new';
    let seatLocked = false;
    let refundStatus: 'none' | 'pending' | 'processing' | 'refunded' | 'rejected' = 'none';
    let completedAt: Date | undefined;
    let cancelledAt: Date | undefined;

    if (legacyStatus === 'confirmed' || hasApprovedPayment) {
      nextStatus = 'confirmed';
      seatLocked = legacyStatus !== 'cancelled' && legacyStatus !== 'refunded';
    } else if (legacyStatus === 'waitlisted') {
      nextStatus = 'waitlisted';
    } else if (legacyStatus === 'onboarding' || (!verified && legacyStatus !== 'waitlisted')) {
      nextStatus = 'onboarding';
    } else if (legacyStatus === 'payment' || verified) {
      nextStatus = 'payment';
    }

    if (legacyStatus === 'refundProcessing') {
      refundStatus = 'processing';
      cancelledAt = reg.cancelledAt || reg.updatedAt || new Date();
    } else if (legacyStatus === 'refunded') {
      refundStatus = 'refunded';
      cancelledAt = reg.cancelledAt || reg.updatedAt || new Date();
    } else if (legacyStatus === 'cancelled') {
      refundStatus = 'pending';
      seatLocked = false;
      cancelledAt = reg.cancelledAt || reg.updatedAt || new Date();
    } else if (legacyStatus === 'completed') {
      completedAt = reg.completedAt || new Date();
      seatLocked = false;
    }

    bulk.push({
      updateOne: {
        filter: { _id: reg._id },
        update: {
          $set: {
            status: nextStatus,
            seatLocked,
            refundStatus,
            completedAt: completedAt || reg.completedAt,
            cancelledAt: cancelledAt || reg.cancelledAt,
          },
          $setOnInsert: {
            waitlistOfferStatus: 'none',
            waitlistAt: reg.waitlistAt || undefined,
          },
        },
      },
    });
  }

  if (bulk.length > 0) {
    await Registration.bulkWrite(bulk);
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  migrateRegistrationStatuses()
    .then(() => {
      console.log('Registration status migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
