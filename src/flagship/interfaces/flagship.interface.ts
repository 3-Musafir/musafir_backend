export class Flagship {
  readonly _id: string;
  legacyFlagshipKey?: string;
  readonly tripName: string;
  readonly destination: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly category: string;
  readonly visibility: string;
  readonly days?: number;
  readonly status?: 'unpublished' | 'published' | 'completed';
  readonly packages?: object[];
  images?: string[];
  detailedPlan?: string;

  // Pricing
  readonly basePrice?: string;
  readonly locations?: {
    name: string;
    price: string;
    enabled: boolean;
  }[];
  readonly tiers?: {
    name: string;
    price: string;
  }[];
  readonly mattressTiers?: {
    name: string;
    price: string;
  }[];
  readonly roomSharingPreference?: {
    name: string;
    price: string;
  }[];

  // Seats Allocation
  readonly totalSeats: number;
  readonly femaleSeats: number;
  readonly maleSeats: number;
  readonly confirmedFemaleCount?: number;
  readonly confirmedMaleCount?: number;
  readonly waitlistedFemaleCount?: number;
  readonly waitlistedMaleCount?: number;
  readonly citySeats: object;
  readonly bedSeats: number;
  readonly mattressSeats: number;
  readonly genderSplitEnabled?: boolean;
  readonly citySplitEnabled?: boolean;
  readonly mattressSplitEnabled?: boolean;
  readonly mattressPriceDelta?: number;
  readonly earlyBirdPrice?: number;

  // Discounts
  readonly discounts?: {
    totalDiscountsValue: string;
    partialTeam: {
      amount: string;
      count: string;
      enabled: boolean;
    };
    soloFemale: {
      amount: string;
      count: string;
      enabled: boolean;
    };
    group: {
      value: string;
      amount: string;
      count: string;
      enabled: boolean;
    };
    musafir: {
      budget: string;
      count: string;
      enabled: boolean;
    };
  };

  // New content fields
  travelPlan?: string;
  tocs?: string;

  // Important Dates
  tripDates: string;
  registrationDeadline: Date;
  advancePaymentDeadline: Date;
  earlyBirdDeadline: Date;

  // payment
  selectedBank?: string;

  // flagship status
  publish: boolean;
}
