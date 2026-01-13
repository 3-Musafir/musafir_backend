import { User } from './interfaces/user.interface';

export type ProfileFieldKey =
  | 'phone'
  | 'cnic'
  | 'city'
  | 'socialLink'
  | 'employmentStatus'
  | 'university'
  | 'gender';

export interface ProfileStatus {
  complete: boolean;
  missing: ProfileFieldKey[];
  requiredFor: {
    general: ProfileFieldKey[];
    flagshipRegistration: ProfileFieldKey[];
    verification: ProfileFieldKey[];
  };
}

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  phone: 'Phone number',
  cnic: 'CNIC',
  city: 'City',
  socialLink: 'Social link',
  employmentStatus: 'Employment status',
  university: 'University/organization',
  gender: 'Gender',
};

const digits = (value?: string) =>
  typeof value === 'string' ? value.replace(/\D/g, '') : '';

const normalizeEmploymentStatus = (user: Partial<User>) =>
  (user as any)?.employmentStatus || 'unemployed';

export function buildProfileStatus(user: Partial<User>): ProfileStatus {
  const employmentStatus = normalizeEmploymentStatus(user);
  const requiresWorkDetail = employmentStatus !== 'unemployed';

  const checkField = {
    phone: () => digits(user.phone || '').length >= 10,
    cnic: () => typeof user.cnic === 'string' && user.cnic.trim().length === 13,
    city: () => Boolean(user.city),
    socialLink: () => Boolean(user.socialLink),
    employmentStatus: () =>
      ['student', 'employed', 'selfEmployed', 'unemployed'].includes(
        employmentStatus as string,
      ),
    university: () => (requiresWorkDetail ? Boolean(user.university) : true),
    gender: () => Boolean(user.gender),
  };

  const generalFields: ProfileFieldKey[] = [
    'phone',
    'cnic',
    'city',
    'socialLink',
    'employmentStatus',
    'university',
    'gender',
  ];

  const flagshipFields: ProfileFieldKey[] = [
    'phone',
    'cnic',
    'city',
    'employmentStatus',
    'university',
    'gender',
  ];

  const verificationFields: ProfileFieldKey[] = [
    'phone',
    'gender',
    'socialLink',
  ];

  const missingFor = (fields: ProfileFieldKey[]) =>
    fields.filter((field) => !checkField[field]());

  const missing = missingFor(generalFields);
  const flagshipMissing = missingFor(flagshipFields);
  const verificationMissing = missingFor(verificationFields);

  return {
    complete: missing.length === 0,
    missing,
    requiredFor: {
      general: missing,
      flagshipRegistration: flagshipMissing,
      verification: verificationMissing,
    },
  };
}

export function isProfileComplete(user: Partial<User>): boolean {
  return buildProfileStatus(user).complete;
}

export function describeMissingProfileFields(fields: ProfileFieldKey[]): string[] {
  return (fields || []).map((field) => PROFILE_FIELD_LABELS[field] || field);
}
