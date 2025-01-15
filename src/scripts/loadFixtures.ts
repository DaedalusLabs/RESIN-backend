import { AppDataSource } from '../config/db.js';
import { Agreement } from '../entities/Agreement.js';
import { NostrUser } from '../entities/NostrUser.js';
import { Property } from '../entities/Property.js';
import { Transaction } from '../entities/Transaction.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadFixtures() {
  try {
    // Initialize the database connection
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    // Create a test user and property if they don't exist
    const userRepository = AppDataSource.getRepository(NostrUser);
    const propertyRepository = AppDataSource.getRepository(Property);

    let testUser = await userRepository.findOneBy({
      pubkey:
        'b5127a08cf33616274800a4387881a9f98e04b9c37116e92de5250498635c422',
    });
    if (!testUser) {
      testUser = userRepository.create({
        pubkey:
          'b5127a08cf33616274800a4387881a9f98e04b9c37116e92de5250498635c422',
        npub: 'npub1k5f85zx0xdskyayqpfpc0zq6n7vwqjuuxugkayk72fgynp34cs3qfcvqg2',
      });
      await userRepository.save(testUser);
      console.log('Created test user');
    }

    let testProperty = await propertyRepository.findOneBy({
      id: 'f6de98bb-d2a5-4301-b594-ddc44e7a16ec',
    });
    if (!testProperty) {
      testProperty = propertyRepository.create({
        id: 'f6de98bb-d2a5-4301-b594-ddc44e7a16ec',
        name: 'Test Property',
        ownershipPercentages: {
          b5127a08cf33616274800a4387881a9f98e04b9c37116e92de5250498635c422: 100,
        },
      });
      await propertyRepository.save(testProperty);
      console.log('Created test property');
    }

    // Load agreements
    const agreementsPath = path.join(__dirname, '../fixtures/agreements.json');
    const agreementsData = JSON.parse(fs.readFileSync(agreementsPath, 'utf8'));
    const agreementRepository = AppDataSource.getRepository(Agreement);

    for (const agreementData of agreementsData.agreements) {
      // Check if agreement already exists
      const existingAgreement = await agreementRepository.findOneBy({
        id: agreementData.id,
      });
      if (!existingAgreement) {
        const agreement = agreementRepository.create({
          ...agreementData,
          signedDate: new Date(agreementData.signedDate),
          user: testUser,
          property: testProperty,
        });
        await agreementRepository.save(agreement);
        console.log(`Created agreement: ${agreementData.title}`);
      } else {
        console.log(`Agreement ${agreementData.id} already exists, skipping`);
      }
    }

    // Load transactions
    const transactionsPath = path.join(
      __dirname,
      '../fixtures/transactions.json'
    );
    const transactionsData = JSON.parse(
      fs.readFileSync(transactionsPath, 'utf8')
    );
    const transactionRepository = AppDataSource.getRepository(Transaction);

    for (const transactionData of transactionsData.transactions) {
      // Check if transaction already exists
      const existingTransaction = await transactionRepository.findOneBy({
        id: transactionData.id,
      });
      if (!existingTransaction) {
        const transaction = transactionRepository.create({
          ...transactionData,
          dueDate: new Date(transactionData.dueDate),
          user: testUser,
          property: testProperty,
        });
        await transactionRepository.save(transaction);
        console.log(
          `Created transaction: ${transactionData.id} (${transactionData.status})`
        );
      } else {
        console.log(
          `Transaction ${transactionData.id} already exists, skipping`
        );
      }
    }

    console.log('Fixtures loaded successfully');
  } catch (error) {
    console.error('Error loading fixtures:', error);
  } finally {
    // Close the database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('Database connection closed');
    }
  }
}

// Run the script
loadFixtures().catch(console.error);
