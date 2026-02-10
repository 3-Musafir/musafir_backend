export type LinkedContactStatus = 'linked' | 'pending' | 'invited' | 'conflict';

export interface LinkedContactPayload {
  email: string;
  status: LinkedContactStatus;
  conflictReason?: string;
  userId?: string;
  registrationId?: string;
  invitedAt?: Date;
  linkedAt?: Date;
}

export interface GroupLinkStatusDto {
  registrationId: string;
  flagshipId?: string | null;
  groupId?: string | null;
  tripType?: string;
  groupSize: number;
  linkedContacts: LinkedContactPayload[];
  groupMembers: string[];
  allLinked: boolean;
}

export interface PendingGroupInviteDto extends GroupLinkStatusDto {
  inviterRegistrationId: string;
}
