import { NostrListing } from '../entities/NostrListing';
import { AppDataSource } from '../config/db';
import fs from 'fs';
import { config } from 'dotenv';
import { NostrEvent } from '@nostr-dev-kit/ndk';
import { processImage, resizeForWeb } from '../lib/image_utils.js';
import { Image } from '../entities/Image';
import { join } from 'path';

config();

if (process.argv.length < 3) {
  console.error('Please provide a JSON file path as an argument');
  console.error('Usage: pnpm resize-images <path-to-json-file>');
  process.exit(1);
}

const jsonPath = process.argv[2];
let data: NostrEvent[] = [];

try {
  const fullPath = join(process.cwd(), jsonPath);
  const fileContent = fs.readFileSync(fullPath, 'utf-8');
  data = JSON.parse(fileContent);
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(`Error reading JSON file: ${error.message}`);
  } else {
    console.error('An unknown error occurred while reading the JSON file');
  }
  process.exit(1);
}

if (!process.env.NOSTR_PRIVKEY) {
  console.error('NOSTR_PRIVKEY environment variable is not set');
  process.exit(1);
}

async function resizeImages() {
  await AppDataSource.initialize();
  const newData = []; // Array to store modified listings

  try {
    const imageRepository = AppDataSource.getRepository(Image);
    for (const l of data) {
      const listing = NostrListing.fromNostrEvent(l);
      const modifiedListing = { ...l }; // Create a copy of the original listing

      // Modify the images array in the content
      const content = JSON.parse(modifiedListing.content as string);
      content.images = listing.images.map((image) => {
        const originalFilename = image.url.split('/').pop()?.split('.')[0];
        const originalFolder = image.url.split('/').slice(-2, -1)[0];
        const resizedFilename = `${originalFilename}.webp`;
        return {
          ...image,
          url: `/static/${originalFolder}/web/${resizedFilename}`,
        };
      });
      modifiedListing.content = JSON.stringify(content);
      newData.push(modifiedListing);

      // Original image processing code
      for (const image of listing.images) {
        const { width, height, blurhash, sha256 } = await processImage(image);
        image.width = width?.toString() ?? '';
        image.height = height?.toString() ?? '';
        image.blurhash = blurhash;
        image.sha256 = sha256;

        const existingImage = await imageRepository.findOneBy({
          sha256: sha256,
        });
        if (existingImage) {
          const originalFilename = image.url.split('/').pop()?.split('.')[0];
          const resizedFilename = `${originalFilename}.webp`;

          if (!fs.existsSync(resizedFilename)) {
            const resizedImage = await resizeForWeb(image);

            const originalFolder = image.url.split('/').slice(-2, -1)[0];
            const resizedPath = join(
              process.cwd(),
              'static',
              originalFolder,
              'web',
              resizedFilename
            );
            const dir = join(process.cwd(), 'static', originalFolder, 'web');
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(resizedPath, resizedImage);
            console.log(`Resized image ${sha256} to ${resizedPath}`);
          }
          console.log(`Image ${sha256} already exists`);
        }
      }
    }

    // Write the new JSON file
    fs.writeFileSync('bch_new.json', JSON.stringify(newData, null, 2));
    console.log(`Created bch_new.json with ${newData.length} listings`);
  } catch (error) {
    console.error('Error during importing:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

resizeImages()
  .then(() => {
    console.log('Import completed');
  })
  .catch((error) => {
    console.error('Import failed:', error);
  });
