import { PaymentService } from './payment.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { RegistrationStatus } from 'src/constants/registration-status.enum';

describe('PaymentService createPayment validations', () => {
  const createService = (amountDue: number, hasPendingPayment = false) => {
    const registration = {
      _id: 'registration-1',
      userId: 'user-1',
      flagship: 'flagship-1',
      status: RegistrationStatus.PAYMENT,
      amountDue,
    } as any;
    const registrationModel = {
      findById: jest.fn().mockResolvedValue(registration),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    } as any;

    const findOneMock = jest.fn().mockReturnValue({
      sort: () => ({
        lean: () => ({
          exec: async () => null,
        }),
      }),
      select: () => ({
        lean: () => ({
          exec: async () => (hasPendingPayment ? { _id: 'pending-1' } : null),
        }),
      }),
    });

    const paymentModel = {
      findOne: findOneMock,
      deleteOne: jest.fn().mockResolvedValue(null),
      findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    } as any;

    const userModel = {
      findById: jest.fn().mockResolvedValue({
        _id: 'user-1',
        verification: { status: VerificationStatus.VERIFIED },
      }),
    } as any;

    const flagshipModel = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: async () => ({ _id: 'flagship-1', tripName: 'Test Trip' }),
          }),
        }),
      }),
    } as any;

    const service = new PaymentService(
      paymentModel as any,
      userModel as any,
      null as any,
      flagshipModel as any,
      registrationModel as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );

    return { service, paymentModel };
  };

  it('rejects payments when no amount is due', async () => {
    const { service } = createService(0);
    await expect(
      service.createPayment(
        {
          registration: 'registration-1',
          amount: 100,
        } as any,
        undefined,
        undefined,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'no_payment_due' }),
    });
  });

  it('rejects a second payment while one is pending approval', async () => {
    const { service } = createService(100, true);
    await expect(
      service.createPayment(
        {
          registration: 'registration-1',
          amount: 100,
          paymentType: 'fullPayment',
        } as any,
        undefined,
        undefined,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'payment_pending_approval' }),
    });
  });

});
