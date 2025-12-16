import 'dotenv/config';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { RegistrationSchema } from 'src/flagship/schemas/registration.schema';
import { UserSchema } from 'src/user/schemas/user.schema';

// Models
let User: any;
let Flagship: any;
let Registration: any;

/**
 * Expected files (CSV headers must match):
 * - seed-data/users.csv:
 *   userKey,fullName,email,phone,city,roles,verification
 *
 * - seed-data/flagships.csv:
 *   flagshipKey,canonicalName
 *
 * - seed-data/registrations.csv:
 *   registrationKey,userKey,flagshipKey,flagshipNameRaw,isPaid,status
 */

type UserRow = {
  userKey: string;
  fullName: string;
  email?: string;
  phone: string;
  city?: string;
  roles?: string; // JSON array string like ["musafir"] or "musafir"
  verification?: string; // JSON string, optional
};

type FlagshipRow = {
  flagshipKey: string;
  canonicalName: string;
};

type RegistrationRow = {
  registrationKey: string;
  userKey: string;
  flagshipKey: string;
  flagshipNameRaw?: string;
  isPaid?: string;
  status?: string;
};

function parseBool(v?: string): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function parseRoles(v?: string): string[] {
  if (!v) return ['musafir'];
  const raw = String(v).trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ignore
  }
  if (raw.includes(',')) return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return [raw];
}

function parseJsonObject(v?: string): Record<string, unknown> {
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function readCsv<T extends Record<string, any>>(filePath: string): Promise<T[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV not found: ${filePath}`);
  }
  const rows: T[] = [];
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(data as T))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return rows;
}

export async function seedFromCSV() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error(
      'MONGO_URI is not set. Put it in musafir_backend/.env or export it in your shell before running seed.',
    );
  }

  const seedDir = path.join(process.cwd(), 'seed-data');
  const usersCsv = path.join(seedDir, 'users.csv');
  const flagshipsCsv = path.join(seedDir, 'flagships.csv');
  const registrationsCsv = path.join(seedDir, 'registrations.csv');

  await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

  // Ensure fresh model definitions
        try {
            mongoose.deleteModel('users');
            mongoose.deleteModel('flagships');
            mongoose.deleteModel('registrations');
  } catch {
    // ignore
        }

        User = mongoose.model('users', UserSchema);
        Flagship = mongoose.model('flagships', FlagshipSchema);
        Registration = mongoose.model('registrations', RegistrationSchema);

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
      verification: { status: 'verified', RequestCall: false },
    });
  }

  // 1) Flagships
  const flagshipRows = await readCsv<FlagshipRow>(flagshipsCsv);
  console.log(`Flagships to process: ${flagshipRows.length}`);

  for (const r of flagshipRows) {
    const legacyFlagshipKey = (r.flagshipKey || '').trim();
    if (!legacyFlagshipKey) continue;
    const tripName = (r.canonicalName || '').trim();

    await Flagship.findOneAndUpdate(
      { legacyFlagshipKey },
      {
        $setOnInsert: {
          legacyFlagshipKey,
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
          tripName: tripName || legacyFlagshipKey,
        },
      },
      { upsert: true, new: true },
    );
  }

  // 2) Users
  const userRows = await readCsv<UserRow>(usersCsv);
  console.log(`Users to process: ${userRows.length}`);

  for (const r of userRows) {
    const legacyUserKey = (r.userKey || '').trim();
    if (!legacyUserKey) continue;

    const email = r.email ? String(r.email).trim().toLowerCase() : undefined;
    const phone = (r.phone || '').trim();
    if (!phone) {
      console.warn(`Skipping user ${legacyUserKey}: phone is required by schema`);
                    continue;
                }

    const roles = parseRoles(r.roles);
    const verification = parseJsonObject(r.verification);

    // Upsert by legacyUserKey first; fallback by email if provided
    const query = email ? { $or: [{ legacyUserKey }, { email }] } : { legacyUserKey };

    await User.findOneAndUpdate(
      query,
      {
        $setOnInsert: {
          referralID: legacyUserKey, // schema requires this; using legacy key is deterministic
          emailVerified: true,
        },
        $set: {
          legacyUserKey,
          fullName: (r.fullName || '').trim(),
          email,
          phone,
          city: r.city ? String(r.city).trim() : undefined,
          roles,
          verification,
        },
      },
      { upsert: true, new: true },
    );
  }

  // 3) Registrations
  const registrationRows = await readCsv<RegistrationRow>(registrationsCsv);
  console.log(`Registrations to process: ${registrationRows.length}`);

  for (const r of registrationRows) {
    const legacyRegistrationKey = (r.registrationKey || '').trim();
    const legacyUserKey = (r.userKey || '').trim();
    const legacyFlagshipKey = (r.flagshipKey || '').trim();
    if (!legacyRegistrationKey || !legacyUserKey || !legacyFlagshipKey) continue;

    const user = await User.findOne({ legacyUserKey }).exec();
    if (!user) {
      console.warn(`Skipping registration ${legacyRegistrationKey}: user not found (${legacyUserKey})`);
                    continue;
                }

    const flagship = await Flagship.findOne({ legacyFlagshipKey }).exec();
                            if (!flagship) {
      console.warn(`Skipping registration ${legacyRegistrationKey}: flagship not found (${legacyFlagshipKey})`);
      continue;
    }

    const isPaid = parseBool(r.isPaid);
    const statusRaw = (r.status || '').trim() || (isPaid ? 'confirmed' : 'pending');
    const status = statusRaw; // schema allows string

    await Registration.findOneAndUpdate(
      { legacyRegistrationKey },
      {
        $setOnInsert: {},
        $set: {
          legacyRegistrationKey,
          userId: user._id,
          user: user._id,
          flagshipId: flagship._id,
          flagship: flagship._id,
          isPaid,
          status,
        },
      },
      { upsert: true, new: true },
    );
  }

  // 4) Update derived user stats (completed trips only)
  const completedCounts = await Registration.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);

  if (completedCounts.length > 0) {
    const bulkOps = completedCounts.map((c: any) => ({
      updateOne: {
        filter: { _id: c._id },
        update: {
          $set: {
            numberOfFlagshipsAttended: c.count,
            discountApplicable: c.count * 500,
          },
        },
      },
    }));
    await User.bulkWrite(bulkOps);
  }

  console.log('✅ Seeding completed!');
}

if (require.main === module) {
  seedFromCSV()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error);
        process.exit(1);
    });
} 