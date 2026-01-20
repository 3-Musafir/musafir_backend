import { PaymentService } from './payment.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { WALLET_TX_IDEMPOTENT_MARKER } from 'src/wallet/wallet.service';

describe('PaymentService.createPayment wallet idempotency', () => {
  it('skips registration updates when wallet debit is idempotent', async () => {
    const registration: any = {
      _id: 'reg1',
      userId: 'user1',
      amountDue: 800,
      walletPaid: 200,
      discountApplied: 0,
      status: 'pending',
      isPaid: false,
      price: 1000,
    };

    const paymentModel: any = {
      exists: jest.fn(async () => null),
    };
    const userModel: any = {
      findById: jest.fn(async () => ({
        _id: 'user1',
        verification: { status: VerificationStatus.VERIFIED },
      })),
    };
    const bankAccountModel: any = {};
    const flagshipModel: any = {};
    const registrationModel: any = {
      findById: jest.fn(async () => registration),
      findByIdAndUpdate: jest.fn(),
    };
    const refundModel: any = {};
    const storageService: any = {};
    const mailService: any = {};
    const notificationService: any = {};

    const walletTx: any = { _id: 'wallet_tx_1', amount: 200 };
    Object.defineProperty(walletTx, WALLET_TX_IDEMPOTENT_MARKER, {
      value: true,
      enumerable: false,
    });

    const walletService: any = {
      debit: jest.fn(async () => walletTx),
      voidBySource: jest.fn(),
    };
    const refundSettlementService: any = {};

    const service = new PaymentService(
      paymentModel,
      userModel,
      bankAccountModel,
      flagshipModel,
      registrationModel,
      refundModel,
      storageService,
      mailService,
      notificationService,
      walletService,
      refundSettlementService,
    );

    const result: any = await service.createPayment(
      {
        registration: 'reg1',
        amount: 0,
        walletAmount: 200,
        walletUseId: 'attempt_1',
        discount: 0,
      } as any,
      undefined,
      { _id: 'user1' } as any,
    );

    expect(walletService.debit).toHaveBeenCalled();
    expect(registrationModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      statusCode: 200,
      data: {
        registrationId: 'reg1',
        walletApplied: 200,
        amountDue: 800,
      },
    });
  });
});

