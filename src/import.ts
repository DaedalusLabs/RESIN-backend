import { NostrListing } from './entities/NostrListing';
import { AppDataSource } from './config/db';
import data from '../bch.json';

import { config } from 'dotenv';
import { processImage } from './lib/image_utils.js';

config();

async function importListings() {
  await AppDataSource.initialize();

  try {
    for (const l of data) {
      const listing = NostrListing.fromNostrEvent(l);

      for (const image of listing.images) {
        const { width, height, blurhash, sha256 } = await processImage(image);
        image.width = width;
        image.height = height;
        image.blurhash = blurhash;
        image.sha256 = sha256;
      }
      await AppDataSource.manager.save(listing);
    }
    console.log(`Imported ${data.length} listings`);
  } catch (error) {
    console.error('Error during importing:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

importListings()
  .then(() => {
    console.log('Import completed');
  })
  .catch((error) => {
    console.error('Import failed:', error);
  });
