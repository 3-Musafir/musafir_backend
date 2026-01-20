import { ForbiddenException } from '@nestjs/common';
import { PaymentService } from './payment.service';

function makeLeanExecQuery<T>(value: T) {
  return {
    select: () => ({
      lean: () => ({
        exec: async () => value,
      }),
    }),
    lean: () => ({
      exec: async () => value,
    }),
    exec: async () => value,
  };
}

describe('PaymentService.getRefundQuote', () => {
  it('includes walletPaid in amountPaid aggregation', async () => {
    const paymentModel: any = {
      aggregate: jest.fn(() => ({
        exec: async () => [{ amountPaid: 700 }],
      })),
    };
    const userModel: any = {};
    const bankAccountModel: any = {};
    const flagshipModel: any = {
      findById: jest.fn(() =>
        makeLeanExecQuery({ startDate: new Date('2026-02-15T00:00:00+05:00') }),
      ),
    };
    const registrationModel: any = {
      findById: jest.fn(() =>
        makeLeanExecQuery({
          _id: '507f1f77bcf86cd799439011',
          userId: 'user1',
          flagshipId: 'flag1',
          walletPaid: 300,
        }),
      ),
    };
    const refundModel: any = {};
    const storageService: any = {};
    const mailService: any = {};
    const notificationService: any = {};
    const walletService: any = {};
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

    const quote: any = await service.getRefundQuote('reg1', { _id: 'user1' } as any);
    expect(quote.amountPaid).toBe(1000);
  });

  it('rejects when requester is not the registration owner', async () => {
    const paymentModel: any = { aggregate: jest.fn(() => ({ exec: async () => [] })) };
    const userModel: any = {};
    const bankAccountModel: any = {};
    const flagshipModel: any = { findById: jest.fn(() => makeLeanExecQuery({ startDate: new Date() })) };
    const registrationModel: any = {
      findById: jest.fn(() =>
        makeLeanExecQuery({ _id: 'reg1', userId: 'user_owner', flagshipId: 'flag1', walletPaid: 0 }),
      ),
    };
    const refundModel: any = {};
    const storageService: any = {};
    const mailService: any = {};
    const notificationService: any = {};
    const walletService: any = {};
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

    await expect(
      service.getRefundQuote('reg1', { _id: 'other_user' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
