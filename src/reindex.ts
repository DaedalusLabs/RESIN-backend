import { TypesenseService } from './services/typesenseService';
import { NostrListing } from './entities/NostrListing';
import { AppDataSource } from './config/db';

import { config } from 'dotenv';

config();

async function reindexAllEntities() {
  await AppDataSource.initialize();
  const typesenseService = new TypesenseService();

  await typesenseService.deleteCollections();
  await typesenseService.createCollections();

  try {
    const listingRepository = AppDataSource.getRepository(NostrListing);
    const listings = await listingRepository.find();
    for (const listing of listings) {
      await listing.updateTypesense();
    }
    console.log(`Reindexed ${listings.length} listings`);
  } catch (error) {
    console.error('Error during reindexing:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

reindexAllEntities()
  .then(() => {
    console.log('Reindexing completed');
  })
  .catch((error) => {
    console.error('Reindexing failed:', error);
  });
