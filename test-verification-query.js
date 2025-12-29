/**
 * Quick test to verify the verification status queries will work
 * Run this with: node test-verification-query.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function testQueries() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Test 1: Count users without verification.status
    const usersWithoutStatus = await usersCollection.countDocuments({
      $or: [
        { 'verification.status': { $exists: false } },
        { 'verification.status': null }
      ]
    });
    console.log(`❌ Users WITHOUT verification.status: ${usersWithoutStatus}`);

    // Test 2: Count users by verification status
    const unverified = await usersCollection.countDocuments({
      'verification.status': 'unverified',
      roles: { $ne: 'admin' }
    });
    const verified = await usersCollection.countDocuments({
      'verification.status': 'verified',
      roles: { $ne: 'admin' }
    });
    const pending = await usersCollection.countDocuments({
      'verification.status': 'pending',
      roles: { $ne: 'admin' }
    });

    console.log(`\n📊 Users by verification status:`);
    console.log(`   Verified: ${verified}`);
    console.log(`   Unverified: ${unverified}`);
    console.log(`   Pending: ${pending}`);
    console.log(`   Total: ${unverified + verified + pending}`);

    // Test 3: Show sample users
    const sampleUsers = await usersCollection.find({}).limit(5).toArray();
    console.log(`\n📝 Sample users (first 5):`);
    sampleUsers.forEach(user => {
      console.log(`   - ${user.fullName || user.email || 'No name'}`);
      console.log(`     verification: ${JSON.stringify(user.verification)}`);
    });

    // Test 4: Total users (excluding admin)
    const totalUsers = await usersCollection.countDocuments({
      roles: { $ne: 'admin' }
    });
    console.log(`\n👥 Total users (excluding admin): ${totalUsers}`);

    await mongoose.connection.close();
    console.log('\n✅ Test completed!');
    
    if (usersWithoutStatus > 0) {
      console.log('\n⚠️  WARNING: Some users are missing verification.status!');
      console.log('   Run: node fix-verification.js');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testQueries();

