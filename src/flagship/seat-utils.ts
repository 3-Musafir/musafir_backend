export type SeatBucket = 'male' | 'female';

export const resolveSeatBucket = (gender?: string): SeatBucket => {
  return gender === 'female' ? 'female' : 'male';
};

export const getRemainingSeatsForBucket = (flagship: any, bucket: SeatBucket): number => {
  const total = bucket === 'female'
    ? Number(flagship?.femaleSeats || 0)
    : Number(flagship?.maleSeats || 0);
  const confirmed = bucket === 'female'
    ? Number(flagship?.confirmedFemaleCount || 0)
    : Number(flagship?.confirmedMaleCount || 0);
  return Math.max(0, total - confirmed);
};

export const getSeatCounterUpdate = (
  bucket: SeatBucket,
  kind: 'confirmed' | 'waitlisted',
  delta: number,
) => {
  if (kind === 'confirmed') {
    return bucket === 'female'
      ? { confirmedFemaleCount: delta }
      : { confirmedMaleCount: delta };
  }
  return bucket === 'female'
    ? { waitlistedFemaleCount: delta }
    : { waitlistedMaleCount: delta };
};
