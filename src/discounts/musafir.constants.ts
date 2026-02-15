export const MUSAFIR_DISCOUNT_PER_TRIP = 500;
export const MUSAFIR_DISCOUNT_MAX = 5000;

export const calcMusafirDiscount = (completedTrips: number): number => {
  const trips = Math.max(0, Math.floor(Number(completedTrips) || 0));
  return Math.min(trips * MUSAFIR_DISCOUNT_PER_TRIP, MUSAFIR_DISCOUNT_MAX);
};
