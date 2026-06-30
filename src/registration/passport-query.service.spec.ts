import { PaymentEligibilityService } from 'src/payment/payment-eligibility.service';
import { PassportQueryService } from './passport-query.service';

const query = (value: unknown) => ({
  select: () => query(value),
  sort: () => query(value),
  lean: () => query(value),
  exec: async () => value,
});

describe('PassportQueryService', () => {
  it('normalizes an approved partial payment into an eligible balance', async () => {
    const paymentModel = {
      find: jest.fn(() =>
        query([
          {
            _id: '507f1f77bcf86cd799439012',
            registration: '507f1f77bcf86cd799439011',
            status: 'approved',
            amount: 30000,
            createdAt: new Date('2026-06-29T00:00:00.000Z'),
          },
        ]),
      ),
    };
    const userModel = {
      findById: jest.fn(() => query({ verification: { status: 'verified' } })),
    };
    const service = new PassportQueryService(
      paymentModel as any,
      userModel as any,
      new PaymentEligibilityService(),
    );

    const [result] = await service.normalize(
      [
        {
          _id: '507f1f77bcf86cd799439011',
          status: 'confirmed',
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          hasApprovedPayment: true,
          paymentSummary: {
            price: 100000,
            discountApplied: 0,
            paidAmount: 30000,
            amountDue: 70000,
          },
          flagship: {
            _id: '507f1f77bcf86cd799439013',
            tripName: 'Rakaposhi',
            startDate: new Date('2026-07-02T00:00:00.000Z'),
            endDate: new Date('2026-07-08T00:00:00.000Z'),
            destination: 'Hunza',
            detailedPlan: 'brief.pdf',
          },
        },
      ],
      '507f1f77bcf86cd799439014',
    );

    expect(result.paymentSummary).toMatchObject({ paidAmount: 30000, amountDue: 70000 });
    expect(result.paymentEligibility).toEqual({ allowed: true, reason: null });
    expect(result.hasDetailedPlan).toBe(true);
  });

  it('uses any pending payment as the authoritative lock', async () => {
    const paymentModel = {
      find: jest.fn(() =>
        query([
          {
            _id: '507f1f77bcf86cd799439012',
            registration: '507f1f77bcf86cd799439011',
            status: 'pendingApproval',
            amount: 30000,
            createdAt: new Date(),
          },
        ]),
      ),
    };
    const userModel = {
      findById: jest.fn(() => query({ verification: { status: 'verified' } })),
    };
    const service = new PassportQueryService(
      paymentModel as any,
      userModel as any,
      new PaymentEligibilityService(),
    );
    const [result] = await service.normalize(
      [
        {
          _id: '507f1f77bcf86cd799439011',
          status: 'payment',
          amountDue: 100000,
          flagship: { _id: '507f1f77bcf86cd799439013' },
        },
      ],
      '507f1f77bcf86cd799439014',
    );

    expect(result.hasPendingPayment).toBe(true);
    expect(result.paymentEligibility.reason).toBe('payment_pending_approval');
  });
});
