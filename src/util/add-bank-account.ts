import mongoose from 'mongoose';
import { BankAccountSchema } from 'src/payment/schema/bankAccount.schema';

const BANK_ACCOUNT_ID = '68f2c0e3a1b2c3d4e5f60718';

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set.');
  }

  await mongoose.connect(uri);

  const BankAccount = mongoose.model('bankAccounts', BankAccountSchema);

  const payload = {
    _id: new mongoose.Types.ObjectId(BANK_ACCOUNT_ID),
    bankName: 'Alfalah Bank (Muhammad Hameez Rizwan)',
    accountNumber: '55015000960473',
    IBAN: '55015000960473',
  };

  const existingById = await BankAccount.findById(payload._id).exec();
  if (existingById) {
    await BankAccount.updateOne({ _id: payload._id }, payload).exec();
    console.log(`Updated bank account ${BANK_ACCOUNT_ID}`);
  } else {
    const existingByAccount = await BankAccount.findOne({
      accountNumber: payload.accountNumber,
    }).exec();
    if (existingByAccount) {
      await BankAccount.updateOne({ _id: existingByAccount._id }, payload).exec();
      console.log(`Updated existing bank account ${existingByAccount._id}`);
    } else {
      await BankAccount.create(payload);
      console.log(`Created bank account ${BANK_ACCOUNT_ID}`);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
