/**
 * Script to fix verification status for users with empty verification objects
 * Run this with: node fix-verification.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixVerificationStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Find all users where verification.status doesn't exist or is null/undefined
    const usersWithoutStatus = await usersCollection.find({
      $or: [
        { 'verification.status': { $exists: false } },
        { 'verification.status': null },
        { verification: {} },
        { verification: { $exists: false } }
      ]
    }).toArray();

    console.log(`Found ${usersWithoutStatus.length} users without verification status`);

    if (usersWithoutStatus.length > 0) {
      // Update all users to have verified status
      const result = await usersCollection.updateMany(
        {
          $or: [
            { 'verification.status': { $exists: false } },
            { 'verification.status': null }
          ]
        },
        {
          $set: {
            'verification.status': 'verified',
            'verification.RequestCall': false,
            'verification.VerificationDate': new Date()
          }
        }
      );

      console.log(`Updated ${result.modifiedCount} users with verified status`);
      
      // Show sample of updated users
      const sampleUsers = await usersCollection.find({
        'verification.status': 'verified'
      }).limit(5).toArray();
      
      console.log('\nSample of updated users:');
      sampleUsers.forEach(user => {
        console.log(`- ${user.fullName || user.email}: verification.status = ${user.verification?.status}`);
      });
    }

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    console.log('✅ Verification status fix completed!');
  } catch (error) {
    console.error('Error fixing verification status:', error);
    process.exit(1);
  }
}

fixVerificationStatus();

