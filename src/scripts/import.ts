import { NostrListing } from '../entities/NostrListing';
import { AppDataSource } from '../config/db';
import { config } from 'dotenv';
import { processImage } from '../lib/image_utils.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NostrEvent } from '@nostr-dev-kit/ndk';

config();

if (process.argv.length < 3) {
  console.error('Please provide a JSON file path as an argument');
  console.error('Usage: pnpm import <path-to-json-file>');
  process.exit(1);
}

const jsonPath = process.argv[2];
let data: NostrEvent[] = [];

try {
  const fullPath = join(process.cwd(), jsonPath);
  const fileContent = readFileSync(fullPath, 'utf-8');
  data = JSON.parse(fileContent);
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(`Error reading JSON file: ${error.message}`);
  } else {
    console.error('An unknown error occurred while reading the JSON file');
  }
  process.exit(1);
}

async function importListings() {
  await AppDataSource.initialize();

  try {
    for (const l of data) {
      const listing = NostrListing.fromNostrEvent(l);

      for (const image of listing.images) {
        const { width, height, blurhash, sha256 } = await processImage(image);
        image.width = width?.toString() ?? '';
        image.height = height?.toString() ?? '';
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
