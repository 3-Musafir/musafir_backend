import mongoose from 'mongoose';
import { PaymentSchema } from 'src/payment/schema/payment.schema';

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is required.');
  await mongoose.connect(mongoUri);
  const Payment = mongoose.model('PaymentPendingAudit', PaymentSchema, 'payments');
  const duplicates = await Payment.aggregate([
    { $match: { status: 'pendingApproval' } },
    {
      $group: {
        _id: '$registration',
        count: { $sum: 1 },
        paymentIds: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).exec();

  console.log(`Registrations with duplicate pending payments: ${duplicates.length}`);
  duplicates.forEach((row) => {
    console.log(
      `registration=${row._id} count=${row.count} payments=${row.paymentIds.join(',')}`,
    );
  });
  await mongoose.disconnect();
  if (duplicates.length) process.exitCode = 2;
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
