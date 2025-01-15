import { AppDataSource } from '../config/db.js';
import { NostrListing } from '../entities/NostrListing.js';
import { NostrEventHistory } from '../entities/NostrEventHistory.js';
import { Not, IsNull } from 'typeorm';

async function migrateEventHistory() {
  try {
    // Initialize the database connection
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    const listingRepository = AppDataSource.getRepository(NostrListing);
    const historyRepository = AppDataSource.getRepository(NostrEventHistory);

    // Get all listings with eventId
    const listings = await listingRepository.find({
      where: {
        eventId: Not(IsNull()),
      },
    });

    console.log(`Found ${listings.length} listings with event IDs`);

    // Create history entries for each listing
    for (const listing of listings) {
      try {
        // Check if history entry already exists
        const existingHistory = await historyRepository.findOne({
          where: {
            eventId: listing.eventId,
            listing: { id: listing.id },
          },
        });

        if (!existingHistory) {
          const history = new NostrEventHistory();
          history.eventId = listing.eventId;
          history.listing = listing;
          await historyRepository.save(history);
          console.log(
            `Created history entry for listing ${listing.id} with event ID ${listing.eventId}`
          );
        } else {
          console.log(
            `History entry already exists for listing ${listing.id} with event ID ${listing.eventId}`
          );
        }
      } catch (error) {
        console.error(`Error processing listing ${listing.id}:`, error);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    // Close the database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('Database connection closed');
    }
  }
}

// Run the migration
migrateEventHistory().catch(console.error);
