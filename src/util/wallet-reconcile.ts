import mongoose from 'mongoose';
import { WalletBalanceSchema } from 'src/wallet/schemas/wallet-balance.schema';
import { WalletTransactionSchema } from 'src/wallet/schemas/wallet-transaction.schema';

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required for wallet reconciliation.');
  }

  await mongoose.connect(mongoUri);

  const WalletBalance = mongoose.model('WalletBalance', WalletBalanceSchema);
  const WalletTransaction = mongoose.model('WalletTransaction', WalletTransactionSchema);

  const txSums = await WalletTransaction.aggregate([
    { $match: { status: 'posted' } },
    {
      $group: {
        _id: '$userId',
        txBalance: {
          $sum: {
            $cond: [
              { $eq: ['$direction', 'credit'] },
              '$amount',
              { $multiply: ['$amount', -1] },
            ],
          },
        },
      },
    },
  ]).exec();

  const balanceDocs = await WalletBalance.find()
    .select('userId balance')
    .lean()
    .exec();

  const balanceByUser = new Map<string, number>();
  balanceDocs.forEach((doc: any) => {
    balanceByUser.set(String(doc.userId), Number(doc.balance) || 0);
  });

  const txByUser = new Map<string, number>();
  txSums.forEach((row: any) => {
    txByUser.set(String(row._id), Number(row.txBalance) || 0);
  });

  const allUserIds = new Set<string>([
    ...Array.from(balanceByUser.keys()),
    ...Array.from(txByUser.keys()),
  ]);

  const mismatches: Array<{
    userId: string;
    balance: number;
    txBalance: number;
    delta: number;
  }> = [];

  allUserIds.forEach((userId) => {
    const balance = balanceByUser.get(userId) || 0;
    const txBalance = txByUser.get(userId) || 0;
    const delta = Number(balance) - Number(txBalance);
    if (delta !== 0) {
      mismatches.push({ userId, balance, txBalance, delta });
    }
  });

  console.log(`Wallet reconciliation results (mismatches: ${mismatches.length})`);
  mismatches
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .forEach((row) => {
      console.log(
        `userId=${row.userId} balance=${row.balance} txBalance=${row.txBalance} delta=${row.delta}`,
      );
    });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Wallet reconciliation failed:', err);
  process.exit(1);
});
