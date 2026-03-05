import 'dotenv/config';
import mongoose from 'mongoose';
import { UserSchema } from 'src/user/schemas/user.schema';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { RegistrationSchema } from 'src/flagship/schemas/registration.schema';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { calcMusafirDiscount } from 'src/discounts/musafir.constants';

async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set.');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    mongoose.deleteModel('users');
    mongoose.deleteModel('flagships');
    mongoose.deleteModel('registrations');
  } catch {
    // ignore
  }

  const User = mongoose.model('users', UserSchema);
  const Flagship = mongoose.model('flagships', FlagshipSchema);
  const Registration = mongoose.model('registrations', RegistrationSchema);

  // Ensure a system user exists for created_By on historical flagships
  const seederEmail = 'seed@3musafir.local';
  let systemUser = await User.findOne({ email: seederEmail });
  if (!systemUser) {
    systemUser = await User.create({
      legacyUserKey: 'USR_SEEDER',
      fullName: 'Seeder User',
      email: seederEmail,
      phone: '0000000000',
      referralID: 'SEEDER',
      roles: ['admin'],
      emailVerified: true,
      verification: { status: VerificationStatus.VERIFIED, RequestCall: false },
    });
  }

  // 1) Upsert the legacy user (phone-only, no email, no password)
  const legacyUserKey = 'USR_e954f32aa678';
  const user = await User.findOneAndUpdate(
    { legacyUserKey },
    {
      $setOnInsert: {
        referralID: legacyUserKey,
        emailVerified: true,
      },
      $set: {
        legacyUserKey,
        fullName: 'Hameez Rizwan',
        gender: 'male',
        phone: '+923444225504',
        roles: ['musafir'],
        verification: {
          status: VerificationStatus.VERIFIED,
          RequestCall: false,
          VerificationDate: new Date(),
        },
      },
    },
    { upsert: true, new: true },
  );
  console.log(`User upserted: ${user._id} (${legacyUserKey})`);

  // 2) Upsert flagships
  const flagships = [
    { key: 'rangfest_2_2023', name: 'Rangfest 2.0' },
    { key: 'summerfest_hunza_3_2023', name: 'Summerfest 3.0 Hunza' },
    { key: 'fairy_meadows_1_2024', name: 'Fairy Meadows 1.0' },
  ];

  const flagshipDocs: Record<string, any> = {};
  for (const f of flagships) {
    const doc = await Flagship.findOneAndUpdate(
      { legacyFlagshipKey: f.key },
      {
        $setOnInsert: {
          legacyFlagshipKey: f.key,
          destination: 'Historical Trip',
          startDate: new Date('2020-01-01'),
          endDate: new Date('2020-01-03'),
          category: 'flagship',
          visibility: 'public',
          created_By: systemUser._id,
          status: 'completed',
          publish: false,
        },
        $set: {
          tripName: f.name,
        },
      },
      { upsert: true, new: true },
    );
    flagshipDocs[f.key] = doc;
    console.log(`Flagship upserted: ${doc._id} (${f.key})`);
  }

  // 3) Upsert registrations
  const registrations = [
    { key: 'REG_246a5795a6dd', flagshipKey: 'rangfest_2_2023' },
    { key: 'REG_e56bd6e38f8c', flagshipKey: 'summerfest_hunza_3_2023' },
    { key: 'REG_83511adcdf1b', flagshipKey: 'fairy_meadows_1_2024' },
  ];

  for (const r of registrations) {
    const flagship = flagshipDocs[r.flagshipKey];
    await Registration.findOneAndUpdate(
      { legacyRegistrationKey: r.key },
      {
        $set: {
          legacyRegistrationKey: r.key,
          userId: user._id,
          user: user._id,
          flagshipId: flagship._id,
          flagship: flagship._id,
          isPaid: true,
          status: 'completed',
          seatLocked: true,
          completedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    console.log(`Registration upserted: ${r.key} → ${r.flagshipKey}`);
  }

  // 4) Update user stats
  const completedCount = await Registration.countDocuments({
    userId: user._id,
    status: 'completed',
  });

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        numberOfFlagshipsAttended: completedCount,
        discountApplicable: calcMusafirDiscount(completedCount),
      },
    },
  );
  console.log(`User stats updated: ${completedCount} flagships, discount: ${calcMusafirDiscount(completedCount)}`);

  console.log('✅ Legacy user seeding completed!');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}
