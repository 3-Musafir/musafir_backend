import { PaymentService } from './payment.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';

describe('PaymentService createPayment validations', () => {
  const createService = (amountDue: number) => {
    const registration = {
      _id: 'registration-1',
      userId: 'user-1',
      flagship: 'flagship-1',
      status: 'payment',
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

    const service = new PaymentService(
      paymentModel as any,
      userModel as any,
      null as any,
      null as any,
      registrationModel as any,
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

});
