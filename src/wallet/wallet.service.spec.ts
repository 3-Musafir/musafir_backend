import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';

function makeLeanQuery<T>(value: T) {
  return {
    lean: () => ({
      exec: async () => value,
    }),
  };
}

describe('WalletService', () => {
  it('is idempotent for (type, metadata.sourceId)', async () => {
    const existingTx = { _id: 'tx1', type: 'topup_credit' };

    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => makeLeanQuery(existingTx)),
      create: jest.fn(),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    const result = await service.credit({
      userId: 'user1',
      amount: 100,
      type: 'topup_credit',
      sourceId: 'source1',
    });

    expect(result).toEqual(existingTx);
    expect(walletBalanceModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(walletTransactionModel.create).not.toHaveBeenCalled();
  });

  it('throws wallet_insufficient_balance on debit when balance is too low', async () => {
    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(async () => null),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => makeLeanQuery(null)),
      create: jest.fn(),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    try {
      await service.debit({
        userId: 'user1',
        amount: 100,
        type: 'flagship_payment_wallet_debit',
        sourceId: 'reg1:attempt1',
      });
      throw new Error('Expected debit to throw');
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({
        code: 'wallet_insufficient_balance',
      });
    }
  });

  it('rolls back balance and returns raced tx on duplicate key error', async () => {
    const racedTx = { _id: 'tx_raced', type: 'refund_credit' };

    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(async () => ({ balance: 500 })),
      updateOne: jest.fn(async () => ({})),
    };

    const findOne = jest
      .fn()
      .mockImplementationOnce(() => makeLeanQuery(null))
      .mockImplementationOnce(() => makeLeanQuery(racedTx));

    const walletTransactionModel: any = {
      findOne,
      create: jest.fn(async () => {
        const err: any = new Error('dup');
        err.code = 11000;
        throw err;
      }),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    const result = await service.credit({
      userId: 'user1',
      amount: 500,
      type: 'refund_credit',
      sourceId: 'refund1',
    });

    expect(result).toEqual(racedTx);
    expect(walletBalanceModel.updateOne).toHaveBeenCalled();
  });

  it('creates a posted credit and updates balanceAfter', async () => {
    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(async () => ({ balance: 200 })),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => makeLeanQuery(null)),
      create: jest.fn(async () => ({
        toObject: () => ({ _id: 'tx1', status: 'posted', balanceAfter: 200 }),
      })),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    const result: any = await service.credit({
      userId: 'user1',
      amount: 200,
      type: 'topup_credit',
      sourceId: 'topup_req_1',
    });

    expect(result).toMatchObject({ status: 'posted', balanceAfter: 200 });
    expect(walletBalanceModel.findOneAndUpdate).toHaveBeenCalled();
    expect(walletTransactionModel.create).toHaveBeenCalled();
  });
});

