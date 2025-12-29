import mongoose, { Model } from 'mongoose';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { RegistrationSchema } from 'src/flagship/schemas/registration.schema';
import { PaymentSchema } from 'src/payment/schema/payment.schema';
import { UserSchema } from 'src/user/schemas/user.schema';
import { faker } from '@faker-js/faker';
import { BankAccountSchema } from 'src/payment/schema/bankAccount.schema';
import { ForgotPasswordSchema } from 'src/user/schemas/forgot-password.schema';
import { FeedbackSchema } from 'src/feedback/schemas/feedback.schema';
import { RatingSchema } from 'src/Rating/schemas/rating.schema';
import { RefundSchema } from 'src/payment/schema/refund.schema';
import { RefreshTokenSchema } from 'src/auth/schemas/refresh-token.schema';
import { FaqSchema } from 'src/FAQ/schemas/faq.schema';
import { VerificationStatus } from 'src/constants/verification-status.enum';

const User = mongoose.model('users', UserSchema);
const Flagship = mongoose.model('flagships', FlagshipSchema);
const Registration = mongoose.model('registrations', RegistrationSchema);
const Payment = mongoose.model('payments', PaymentSchema);
const BankAccount = mongoose.model('bankAccounts', BankAccountSchema);
const ForgotPassword = mongoose.model('forgotPasswords', ForgotPasswordSchema);
const Feedback = mongoose.model('feedbacks', FeedbackSchema);
const Rating = mongoose.model('ratings', RatingSchema);
const Refund = mongoose.model('refunds', RefundSchema);
const RefreshToken = mongoose.model('refreshTokens', RefreshTokenSchema);
const FAQ = mongoose.model('faqs', FaqSchema);

export async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  // Ensure an admin user exists so protected routes remain accessible
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@musafir.local';
  const adminReferralId = 'ADMIN_REF';
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      fullName: 'Default Admin',
      email: adminEmail,
      password: process.env.ADMIN_PASSWORD ?? 'ChangeMe123!',
      phone: '0000000000',
      referralID: adminReferralId,
      gender: 'other',
      roles: ['admin'],
      emailVerified: true,
      verification: { status: VerificationStatus.VERIFIED, RequestCall: false },
    });
    console.log(`Seeded admin user ${adminEmail}`);
  }

  // await Flagship.deleteMany({});
  // await User.deleteMany({});
  // await Registration.deleteMany({});
  // await Payment.deleteMany({});
  // await BankAccount.deleteMany({});
  // await ForgotPassword.deleteMany({});
  // await Feedback.deleteMany({});
  // await Rating.deleteMany({});
  // await Refund.deleteMany({});
  // await RefreshToken.deleteMany({});
  // await FAQ.deleteMany({});

  // const seedUsers = [];

  // for (let i = 0; i < 10; i++) {
  //   const fullName = faker.person.fullName();
  //   const profileImg =
  //     'https://c4.wallpaperflare.com/wallpaper/146/496/963/anime-girls-artwork-gothic-death-note-wallpaper-preview.jpg';
  //   const email = faker.internet.email();
  //   const password = 'password123'; // Default password, will be hashed
  //   const phone = faker.phone.number();
  //   const referralID = faker.string.uuid();
  //   const gender = faker.helpers.arrayElement(['male', 'female', 'other']);
  //   const cnic = '35200642742184';
  //   const city = faker.helpers.arrayElement(['Lahore', 'Islamabad', 'Karachi']);
  //   const university = faker.helpers.arrayElement([
  //     'FAST NUCES',
  //     'LUMS',
  //     'COMSATS',
  //   ]);
  //   const socialLink = faker.internet.url();
  //   const dateOfBirth = faker.date.past();

  //   seedUsers.push({
  //     fullName,
  //     profileImg,
  //     email,
  //     password,
  //     phone,
  //     referralID,
  //     gender,
  //     city,
  //     dateOfBirth,
  //     university,
  //     cnic,
  //     socialLink,
  //     roles: ['musafir'],
  //     verification: {
  //       status: faker.helpers.arrayElement(['pending', 'verified']),
  //       RequestCall: faker.datatype.boolean(),
  //     },
  //   });
  // }

  // await User.insertMany(seedUsers);

  // const bankAccounts = [
  //   {
  //     bankName: 'Standard Chartered',
  //     accountNumber: '1234567890',
  //     IBAN: '1234567890',
  //   },
  //   {
  //     bankName: 'Dubai Islamic Bank',
  //     accountNumber: '1234567890',
  //     IBAN: '1234567890',
  //   },
  // ];

  // const accounts = await BankAccount.insertMany(bankAccounts);

  // const user = await User.findOne();
  // if (!user) {
  //   console.error('No users found in the database.');
  //   return;
  // }

  // const flagshipData = [
  //   {
  //     tripName: 'Mountain Adventure',
  //     startDate: new Date('2025-06-15'),
  //     endDate: new Date('2025-06-20'),
  //     category: 'adventure',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Himalayas',
  //     days: 5,
  //     seats: 30,
  //     status: 'completed',
  //     packages: [
  //       {
  //         name: 'Standard Package',
  //         features: ['Guide', 'Meals'],
  //         price: '500',
  //       },
  //       {
  //         name: 'Premium Package',
  //         features: ['Guide', 'Meals', 'Equipment'],
  //         price: '800',
  //       },
  //     ],
  //     basePrice: '400',
  //     locations: [
  //       { name: 'Base Camp', price: '100', enabled: true },
  //       { name: 'Summit', price: '200', enabled: true },
  //     ],
  //     tiers: [
  //       { name: 'Economy', price: '100' },
  //       { name: 'Business', price: '200' },
  //     ],
  //     mattressTiers: [
  //       { name: 'Standard Mattress', price: '50' },
  //       { name: 'Deluxe Mattress', price: '100' },
  //     ],
  //     travelPlanContent: 'Detailed travel plan content goes here.',
  //     tocsContent: 'Terms and conditions content goes here.',
  //     files: [
  //       { name: 'itinerary.pdf', size: '2MB' },
  //       { name: 'packing_list.pdf', size: '500KB' },
  //     ],
  //     totalSeats: 30,
  //     femaleSeats: 15,
  //     maleSeats: 15,
  //     citySeats: [
  //       { city: 'Lahore', seats: 10 },
  //       { city: 'Karachi', seats: 10 },
  //       { city: 'Islamabad', seats: 10 },
  //     ],
  //     bedSeats: 20,
  //     mattressSeats: 10,
  //   },
  //   // Past Trip
  //   {
  //     tripName: 'Beach Getaway',
  //     startDate: new Date('2023-01-15'),
  //     endDate: new Date('2023-01-20'),
  //     category: 'flagship',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Maldives',
  //     days: 5,
  //     seats: 20,
  //     status: 'completed',
  //     basePrice: '600',
  //     totalSeats: 20,
  //     femaleSeats: 10,
  //     maleSeats: 10,
  //   },
  //   // Live Trip
  //   {
  //     tripName: 'Desert Safari',
  //     startDate: new Date('2024-04-21'),
  //     endDate: new Date('2024-05-05'),
  //     category: 'adventure',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Thar Desert',
  //     days: 4,
  //     seats: 25,
  //     status: 'published',
  //     basePrice: '450',
  //     totalSeats: 25,
  //     femaleSeats: 12,
  //     maleSeats: 13,
  //   },
  //   // Upcoming Trip
  //   {
  //     tripName: 'Northern Areas Tour',
  //     startDate: new Date('2024-07-01'),
  //     endDate: new Date('2024-07-10'),
  //     category: 'adventure',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Hunza Valley',
  //     days: 9,
  //     seats: 15,
  //     status: 'published',
  //     basePrice: '800',
  //     totalSeats: 15,
  //     femaleSeats: 7,
  //     maleSeats: 8,
  //   },
  //   // Another Past Trip
  //   {
  //     tripName: 'Winter Wonderland',
  //     startDate: new Date('2023-12-20'),
  //     endDate: new Date('2023-12-25'),
  //     category: 'flagship',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Naran',
  //     days: 5,
  //     seats: 18,
  //     status: 'completed',
  //     basePrice: '550',
  //     totalSeats: 18,
  //     femaleSeats: 9,
  //     maleSeats: 9,
  //   },
  //   // Another Upcoming Trip
  //   {
  //     tripName: 'Summer Camp',
  //     startDate: new Date('2024-08-15'),
  //     endDate: new Date('2024-08-20'),
  //     category: 'student',
  //     visibility: 'public',
  //     image:
  //       'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSsUaHZRZ95ghwWEHkV6m3PhW_qlsHRlx3pSw&s',
  //     created_By: user._id,
  //     destination: 'Murree',
  //     days: 5,
  //     seats: 40,
  //     status: 'published',
  //     basePrice: '300',
  //     totalSeats: 40,
  //     femaleSeats: 20,
  //     maleSeats: 20,
  //   },
  // ];

  // // Insert the sample data into the database
  // await Flagship.insertMany(flagshipData);

  // const users = await User.find().limit(10); // Get some users
  // const flagships = await Flagship.find().limit(6); // Get all flagship trips

  // if (!users.length || !flagships.length) {
  //   console.log('Please seed users and flagship trips first');
  //   process.exit(1);
  // }
  // for (let i = 0; i < 20; i++) {
  //   const randomUser = users[Math.floor(Math.random() * users.length)];
  //   const randomFlagship =
  //     flagships[Math.floor(Math.random() * flagships.length)];

  //   const bankNames = ['Standard Chartered', 'Meezan', 'Habib Bank'];
  //   const paymentType = ['partialPayment', 'fullPayment'];
  //   const paymentStatus = ['pendingApproval', 'approved', 'rejected'];
  //   const statuses = ['pending', 'accepted', 'rejected'];
  //   const registration = await Registration.create({
  //     flagship: randomFlagship._id,
  //     flagshipId: randomFlagship._id,
  //     user: randomUser._id,
  //     userId: randomUser._id,
  //     type: 'solo',
  //     status: statuses[Math.floor(Math.random() * statuses.length)],
  //     comment: 'Auto-generated registration',
  //   });

  //   await Payment.create({
  //     bankAccount:
  //       accounts[Math.floor(Math.random() * bankAccounts.length)]._id,
  //     registration: registration._id,
  //     amount: Math.floor(Math.random() * 1000) + 5000,
  //     status: paymentStatus[Math.floor(Math.random() * paymentStatus.length)],
  //     bankName: bankNames[Math.floor(Math.random() * bankNames.length)],
  //     paymentType: paymentType[Math.floor(Math.random() * paymentType.length)],
  //     screenshot:
  //       'https://thumbs.dreamstime.com/z/illustration-receipt-template-black-white-vector-129915676.jpg',
  //   });
  // }

  console.log('Seeding completed!');
  // process.exit(0);
}
