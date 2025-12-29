/**
 * Enum for user verification status
 * This represents the identity verification status of a user, not email verification
 */
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/**
 * Helper function to get all verification status values
 */
export function getVerificationStatusValues(): string[] {
  return Object.values(VerificationStatus);
}

/**
 * Helper function to check if a string is a valid verification status
 */
export function isValidVerificationStatus(status: string): status is VerificationStatus {
  return Object.values(VerificationStatus).includes(status as VerificationStatus);
}

