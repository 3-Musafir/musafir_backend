import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment } from 'src/payment/interface/payment.interface';
import { User } from 'src/user/interfaces/user.interface';
import { PaymentEligibilityService } from 'src/payment/payment-eligibility.service';
import { PassportRegistrationDto } from './dto/passport-registration.dto';

interface LegacyTripSnapshot {
  _id?: unknown;
  tripName?: unknown;
  startDate?: Date | string;
  endDate?: Date | string;
  destination?: unknown;
  images?: unknown[];
  detailedPlan?: unknown;
}

interface LegacyPassportSnapshot {
  _id?: unknown;
  flagship?: LegacyTripSnapshot;
  flagshipId?: LegacyTripSnapshot;
  status?: unknown;
  createdAt?: Date | string;
  completedAt?: Date | string;
  cancelledAt?: Date | string;
  refundStatus?: unknown;
  amountDue?: unknown;
  price?: unknown;
  discountApplied?: unknown;
  hasApprovedPayment?: unknown;
  ratingId?: { rating?: unknown };
  paymentSummary?: {
    amountDue?: unknown;
    price?: unknown;
    discountApplied?: unknown;
    paidAmount?: unknown;
  };
}

interface PaymentSnapshot {
  _id: unknown;
  registration: unknown;
  status: 'pendingApproval' | 'approved' | 'rejected';
  amount: unknown;
  createdAt: Date | string;
  rejectionPublicNote?: string;
}

const amount = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, value);
};

@Injectable()
export class PassportQueryService {
  constructor(
    @InjectModel('Payment') private readonly paymentModel: Model<Payment>,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly paymentEligibility: PaymentEligibilityService,
  ) {}

  async normalize(registrations: unknown[], userId: string): Promise<PassportRegistrationDto[]> {
    const snapshots = registrations as LegacyPassportSnapshot[];
    const ids = snapshots
      .map((registration) => registration?._id)
      .filter((id) => id && Types.ObjectId.isValid(String(id)));
    const payments = ids.length
      ? await this.paymentModel
          .find({ registration: { $in: ids } })
          .select('registration status amount createdAt rejectionPublicNote')
          .sort({ createdAt: -1 })
          .lean()
          .exec()
      : [];
    const user = await this.userModel.findById(userId).select('verification.status').lean().exec();
    const verificationStatus = (user as unknown as { verification?: { status?: string } })
      ?.verification?.status;
    const latestByRegistration = new Map<string, PaymentSnapshot>();
    const pendingRegistrationIds = new Set<string>();

    for (const payment of payments as unknown as PaymentSnapshot[]) {
      const registrationId = String(payment.registration);
      if (!latestByRegistration.has(registrationId)) latestByRegistration.set(registrationId, payment);
      if (payment.status === 'pendingApproval') pendingRegistrationIds.add(registrationId);
    }

    return snapshots.map((registration) => {
      const registrationId = String(registration._id);
      const trip = registration.flagship || registration.flagshipId || {};
      const summary = registration.paymentSummary || {};
      const due = amount(summary.amountDue ?? registration.amountDue);
      const price = amount(summary.price ?? registration.price) ?? 0;
      const discountApplied = amount(summary.discountApplied ?? registration.discountApplied) ?? 0;
      const paidAmount = amount(summary.paidAmount) ?? Math.max(0, price - discountApplied - (due ?? 0));
      const hasPendingPayment = pendingRegistrationIds.has(registrationId);
      const latest = latestByRegistration.get(registrationId);
      const refundStatus = String(registration.refundStatus || 'none');
      const isRefundLocked = ['pending', 'processing', 'refunded'].includes(refundStatus);
      const briefEligible = !registration.cancelledAt && !isRefundLocked;

      return {
        id: registrationId,
        trip: {
          id: String(trip?._id || ''),
          title: String(trip.tripName || 'Trip'),
          startDate: trip?.startDate ? new Date(trip.startDate).toISOString() : '',
          endDate: trip?.endDate ? new Date(trip.endDate).toISOString() : '',
          destination: String(trip.destination || ''),
          images: Array.isArray(trip.images) ? trip.images.map(String) : [],
        },
        registrationStatus: String(registration.status || ''),
        registeredAt: registration.createdAt ? new Date(registration.createdAt).toISOString() : '',
        completedAt: registration.completedAt
          ? new Date(registration.completedAt).toISOString()
          : undefined,
        cancelledAt: registration.cancelledAt
          ? new Date(registration.cancelledAt).toISOString()
          : undefined,
        refundStatus,
        rating:
          typeof registration.ratingId?.rating === 'number'
            ? registration.ratingId.rating
            : undefined,
        paymentSummary: {
          price,
          discountApplied,
          paidAmount,
          amountDue: due ?? 0,
          isFullyPaid: due === 0,
        },
        hasApprovedPayment: Boolean(registration.hasApprovedPayment || paidAmount > 0),
        hasPendingPayment,
        latestPayment: latest
          ? {
              id: String(latest._id),
              status: latest.status,
              amount: amount(latest.amount) ?? 0,
              submittedAt: new Date(latest.createdAt).toISOString(),
              rejectionMessage: latest.rejectionPublicNote || undefined,
            }
          : null,
        paymentEligibility: this.paymentEligibility.evaluate({
          registrationStatus:
            typeof registration.status === 'string' ? registration.status : null,
          verificationStatus,
          amountDue: due,
          hasPendingPayment,
          cancelledAt: registration.cancelledAt,
          refundStatus,
        }),
        hasDetailedPlan: Boolean(trip.detailedPlan),
        briefEligible,
      };
    });
  }
}
