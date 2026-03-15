import { PaymentService } from './payment.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { WALLET_TX_IDEMPOTENT_MARKER } from 'src/wallet/wallet.service';

describe('PaymentService.createPayment wallet idempotency', () => {
  it('auto-approves wallet-only payments and debits wallet immediately', async () => {
    const registration: any = {
      _id: 'reg1',
      userId: 'user1',
      amountDue: 800,
      walletPaid: 200,
      discountApplied: 0,
      status: 'payment',
      isPaid: false,
      price: 1000,
    };

    const paymentModel: any = function (data: any) {
      Object.assign(this, data);
      this._id = 'payment1';
      this.createdAt = new Date();
      this.save = jest.fn(async () => this);
    };
    paymentModel.findOne = jest.fn().mockReturnValue({
      sort: () => ({
        lean: () => ({
          exec: async () => null,
        }),
      }),
    });
    paymentModel.deleteOne = jest.fn(async () => null);
    paymentModel.findByIdAndUpdate = jest.fn(async () => null);
    const userModel: any = {
      findById: jest.fn(async () => ({
        _id: 'user1',
        verification: { status: VerificationStatus.VERIFIED },
      })),
    };
    const bankAccountModel: any = {};
    const flagshipModel: any = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: async () => null,
          }),
        }),
      }),
    };
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
    service.approvePayment = jest.fn(async () => ({
      _id: 'payment1',
      status: 'approved',
    })) as any;

    const result: any = await service.createPayment(
      {
        registration: 'reg1',
        amount: 0,
        walletAmount: 200,
        walletUseId: 'attempt_1',
        discount: 0,
        paymentType: 'fullPayment',
      } as any,
      undefined,
      { _id: 'user1' } as any,
    );

    expect(walletService.debit).toHaveBeenCalled();
    expect(service.approvePayment).toHaveBeenCalled();
    expect(result).toMatchObject({
      _id: 'payment1',
      status: 'approved',
    });
  });
});
