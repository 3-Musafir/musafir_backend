import 'dotenv/config';
import mongoose from 'mongoose';
import { UserSchema } from 'src/user/schemas/user.schema';
import { RegistrationSchema } from 'src/flagship/schemas/registration.schema';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { calcMusafirDiscount } from 'src/discounts/musafir.constants';

/**
 * One-time reconciliation script.
 *
 * Finds legacy (phone-only, no email) users that were seeded AFTER
 * a real user already signed up via Google SSO or email+password.
 * Merges registrations + stats from the legacy shell into the real
 * user, then deletes the shell.
 *
 * Usage:
 *   npm run reconcile:legacy -- --dry-run   # preview only
 *   npm run reconcile:legacy                # execute merges
 */

async function reconcile() {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set.');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    mongoose.deleteModel('users');
    mongoose.deleteModel('registrations');
  } catch {
    // ignore
  }

  const User = mongoose.model('users', UserSchema);
  const Registration = mongoose.model('registrations', RegistrationSchema);

  // Find all legacy shell users: have legacyUserKey, no email, no password
  const legacyUsers = await User.find({
    legacyUserKey: { $exists: true, $regex: /^USR_/ },
    $or: [{ email: null }, { email: { $exists: false } }, { email: '' }],
    password: { $exists: false },
  }).exec();

  console.log(`Found ${legacyUsers.length} legacy shell users to check`);

  let merged = 0;
  let skipped = 0;

  for (const legacy of legacyUsers as any[]) {
    const phone = String(legacy.phone || '');
    if (!phone) {
      skipped++;
      continue;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      skipped++;
      continue;
    }

    const suffix = digits.slice(-10);
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}$`);

    // Find real users (have email or googleId) with matching phone
    const realUsers = await User.find({
      _id: { $ne: legacy._id },
      phone: { $regex: re },
      $or: [
        { email: { $exists: true, $nin: [null, ''] } },
        { googleId: { $exists: true, $ne: null } },
      ],
    })
      .limit(5)
      .exec();

    if (realUsers.length !== 1) {
      if (realUsers.length > 1) {
        console.log(
          `SKIP ${legacy.legacyUserKey} (${phone}): ${realUsers.length} matches (ambiguous)`,
        );
      }
      skipped++;
      continue;
    }

    const realUser = realUsers[0] as any;
    console.log(
      `${dryRun ? '[DRY-RUN] ' : ''}MERGE ${legacy.legacyUserKey} (${phone}) → ${realUser._id} (${realUser.email || realUser.phone})`,
    );

    if (!dryRun) {
      // Transfer registrations
      const result = await Registration.updateMany(
        { $or: [{ userId: legacy._id }, { user: legacy._id }] },
        { $set: { userId: realUser._id, user: realUser._id } },
      );
      console.log(`  Transferred ${result.modifiedCount} registrations`);

      // Carry over stats
      if (legacy.numberOfFlagshipsAttended) {
        realUser.numberOfFlagshipsAttended = legacy.numberOfFlagshipsAttended;
        realUser.discountApplicable = calcMusafirDiscount(
          legacy.numberOfFlagshipsAttended,
        );
      }

      // Carry over verification
      if (
        legacy.verification?.status === VerificationStatus.VERIFIED &&
        realUser.verification?.status !== VerificationStatus.VERIFIED
      ) {
        realUser.verification.status = VerificationStatus.VERIFIED;
        realUser.verification.RequestCall = false;
      }

      // Carry over legacyUserKey
      realUser.legacyUserKey = legacy.legacyUserKey;

      // Carry over gender if real user doesn't have one
      if (!realUser.gender && legacy.gender) {
        realUser.gender = legacy.gender;
      }

      // Use legacy referralID if it's a proper code (not a raw USR_ key)
      if (
        legacy.referralID &&
        !legacy.referralID.startsWith('USR_') &&
        (!realUser.referralID || realUser.referralID.startsWith('USR_'))
      ) {
        realUser.referralID = legacy.referralID;
      }

      await realUser.save();
      await User.deleteOne({ _id: legacy._id });
    }

    merged++;
  }

  console.log(
    `\n${dryRun ? '(DRY RUN) ' : ''}Reconciliation complete: ${merged} merged, ${skipped} skipped`,
  );

  await mongoose.disconnect();
}

reconcile()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Reconciliation failed:', error);
    process.exit(1);
  });
