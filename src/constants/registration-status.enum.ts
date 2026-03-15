/**
 * Enum for registration status
 * Represents the lifecycle status of a trip registration
 */
export enum RegistrationStatus {
  NEW = 'new',
  ONBOARDING = 'onboarding',
  WAITLISTED = 'waitlisted',
  PAYMENT = 'payment',
  CONFIRMED = 'confirmed',
}

/**
 * Helper function to get all registration status values
 */
export function getRegistrationStatusValues(): string[] {
  return Object.values(RegistrationStatus);
}

/**
 * Helper function to check if a string is a valid registration status
 */
export function isValidRegistrationStatus(status: string): status is RegistrationStatus {
  return Object.values(RegistrationStatus).includes(status as RegistrationStatus);
}
