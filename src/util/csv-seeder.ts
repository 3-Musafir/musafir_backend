import mongoose, { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { RegistrationSchema } from 'src/flagship/schemas/registration.schema';
import { UserSchema } from 'src/user/schemas/user.schema';

// Define models
let User: any;
let Flagship: any;
let Registration: any;

interface CSVRow {
    Name: string;
    Email: string;
    Contact: string;
    Event: string;
    MID: string;
    'Results': string; // Number of Flagships
    'Column 1': string; // Discount Applicable
    'Column 2': string; // List of trips
}

interface ErrorRow {
    row: number;
    email: string;
    name: string;
    error: string;
    data: any;
}

export async function seedFromCSV() {
    try {
        // console.log("MONGO_URI: ", process.env.MONGO_URI);
        await mongoose.connect('mongodb+srv://imasadali7:0O5WTJaZAnRfhQcW@musafirdb.phwdtas.mongodb.net/?retryWrites=true&w=majority&appName=musafirdb');
        console.log('Connected to MongoDB');

        // Delete existing models to ensure we use the latest schema
        try {
            mongoose.deleteModel('users');
            mongoose.deleteModel('flagships');
            mongoose.deleteModel('registrations');
        } catch (error) {
            // Ignore errors if models don't exist
            console.log('Models not found in cache, creating new ones...');
        }

        // Define models
        User = mongoose.model('users', UserSchema);
        Flagship = mongoose.model('flagships', FlagshipSchema);
        Registration = mongoose.model('registrations', RegistrationSchema);

        // Read CSV file using csv-parser
        const csvPath = path.join(__dirname, '../../data.csv');
        const results: any[] = [];

        // Parse CSV with csv-parser
        await new Promise((resolve, reject) => {
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        // Filter out header rows and problematic rows
        const validRows = results.filter((row, index) => {
            // Skip rows that are just event headers (no name, no email, but has event)
            if (!row.Name && !row.Email && row.Event) {
                console.log(`Skipping event header row: ${row.Event}`);
                return false;
            }

            // Skip rows with #VALUE! errors
            if (Object.values(row).some(v => v === '#VALUE!')) {
                console.log(`Skipping row with #VALUE! error at row ${index + 3}`);
                return false;
            }

            return true;
        });

        console.log(`Total rows to process: ${validRows.length}`);

        const errorRows: ErrorRow[] = [];
        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // Process all rows
        for (let i = 0; i < validRows.length; i++) {
            const row = validRows[i];
            processedCount++;

            try {
                // Skip if no name (but allow users without email)
                if (!row.Name) {
                    const error: ErrorRow = {
                        row: i + 3, // +3 because we skipped header rows and i is 0-based
                        email: row.Email || 'NO_EMAIL',
                        name: row.Name || 'NO_NAME',
                        error: 'Missing name',
                        data: row
                    };
                    errorRows.push(error);
                    errorCount++;
                    console.log(`${processedCount}/${validRows.length} ${row.Email || 'NO_EMAIL'} -- failed: Missing name`);
                    continue;
                }

                // Check if user already exists by email
                const existingUser = await User.findOne({ email: row.Email.toLowerCase() });
                if (existingUser) {
                    const error: ErrorRow = {
                        row: i + 3,
                        email: row.Email,
                        name: row.Name,
                        error: 'User already exists with this email',
                        data: row
                    };
                    errorRows.push(error);
                    errorCount++;
                    console.log(`${processedCount}/${validRows.length} ${row.Email} -- failed: User already exists`);
                    continue;
                }

                // Create user
                const userData = {
                    fullName: row.Name,
                    email: row.Email?.trim() ? row.Email.toLowerCase() : undefined,
                    phone: row.Contact,
                    referralID: row.MID,
                    roles: ['musafir'],
                    emailVerified: true,
                    verification: {
                        status: 'verified'
                    },
                    discountApplicable: parseInt(row['Column 1']) || 0,
                    numberOfFlagshipsAttended: parseInt(row['Results']) || 0
                };

                const user = await User.create(userData);

                // Process flagship trips
                if (row['Column 2']) {
                    const tripNames = row['Column 2']
                        .split(',')
                        .map(name => name.trim())
                        .filter(name => name && name !== '');

                    for (const tripName of tripNames) {
                        try {
                            // Check if flagship exists
                            let flagship = await Flagship.findOne({
                                tripName: { $regex: new RegExp(tripName, 'i') }
                            });

                            if (!flagship) {
                                // If flagship doesn't exist, create it
                                flagship = await Flagship.create({
                                    tripName: tripName,
                                    destination: 'Historical Trip', // Default for historical data
                                    startDate: new Date('2020-01-01'), // Default historical date
                                    endDate: new Date('2020-01-03'), // Default historical date
                                    category: 'flagship', // Default category
                                    visibility: 'public', // Default visibility
                                    created_By: user._id,
                                    status: 'completed'
                                });
                            }

                            // Create registration
                            await Registration.create({
                                flagshipId: flagship._id,
                                userId: user._id,
                                user: user._id,
                                flagship: flagship._id,
                                status: 'completed',
                                isPaid: true
                            });

                        } catch (tripError) {
                            console.error(`❌ Error processing trip "${tripName}" for user ${row.Email}:`, tripError);
                        }
                    }
                }

                successCount++;
                console.log(`✅ ${processedCount}/${validRows.length} ${row.Email || 'NO_EMAIL'} -- done`);

            } catch (error) {
                const errorRow: ErrorRow = {
                    row: i + 3,
                    email: row.Email || 'NO_EMAIL',
                    name: row.Name || 'NO_NAME',
                    error: error.message,
                    data: row
                };
                errorRows.push(errorRow);
                errorCount++;
                console.log(`❌ ${processedCount}/${validRows.length} ${row.Email || 'NO_EMAIL'} -- failed: ${error.message}`);
            }
        }

        // Create error CSV file
        if (errorRows.length > 0) {
            const errorCSVPath = path.join(__dirname, '../../error_log.csv');
            const errorCSVContent = [
                'Row,Email,Name,Error,Data',
                ...errorRows.map(row =>
                    `${row.row},"${row.email}","${row.name}","${row.error}","${JSON.stringify(row.data).replace(/"/g, '""')}"`
                )
            ].join('\n');

            fs.writeFileSync(errorCSVPath, errorCSVContent);
            console.log(`Error log saved to: ${errorCSVPath}`);
        }

        console.log('\n=== SEEDING COMPLETED ===');
        console.log(`Total processed: ${processedCount}`);
        console.log(`Successful: ${successCount}`);
        console.log(`Failed: ${errorCount}`);
        console.log(`Error log saved to: error_log.csv`);

    } catch (error) {
        console.error('Seeding failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the seeder if this file is executed directly
if (require.main === module) {
    seedFromCSV().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Seeding failed:', error);
        process.exit(1);
    });
} 