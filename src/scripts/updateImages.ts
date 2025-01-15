import { AppDataSource } from '../config/db.js';
import { Image } from '../entities/Image.js';
import { Thumbnail } from '../entities/Thumbnail.js';
import { encode } from 'blurhash';
import sharp, { FormatEnum } from 'sharp';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { IsNull } from 'typeorm';
import { config } from 'dotenv';
import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { EventTemplate, BlossomClient } from 'blossom-client-sdk';
import { UnsignedEvent, getEventHash } from 'nostr-tools';
import { nostrRelays } from '../config/nostrRelays.js';

config();

if (!process.env.NOSTR_PRIVKEY) {
  throw new Error('NOSTR_PRIVKEY environment variable is not set');
}

if (!process.env.BLOSSOM_SERVER) {
  throw new Error('BLOSSOM_SERVER environment variable is not set');
}

const signer = new NDKPrivateKeySigner(process.env.NOSTR_PRIVKEY);
const ndk = new NDK({ signer: signer, explicitRelayUrls: nostrRelays });

const blossomSigner = async (draft: EventTemplate) => {
  const pubKey = (await signer.user()).pubkey;

  // add the pubkey to the draft event
  const event: UnsignedEvent = { ...draft, pubkey: pubKey };
  // get the signature
  const sig = await ndk.signer!.sign(event);

  // return the event + id + sig
  return { ...event, sig, id: getEventHash(event) };
};

const blossomClient = new BlossomClient(
  process.env.BLOSSOM_SERVER,
  blossomSigner
);

type ThumbnailSize = {
  name: string;
  width: number;
  format: keyof FormatEnum;
};

const THUMBNAIL_SIZES: ThumbnailSize[] = [
  { name: 'small', width: 375, format: 'webp' },
  { name: 'medium', width: 600, format: 'webp' },
  { name: 'large', width: 1280, format: 'webp' },
];

async function downloadImage(url: string): Promise<Buffer> {
  if (url.startsWith('http')) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } else {
    // Local file in static directory
    const staticPath = path.join(process.cwd(), 'static', url);
    return fs.promises.readFile(staticPath);
  }
}

async function calculateBlurhash(imageBuffer: Buffer): Promise<string> {
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

async function calculateSha256(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}

async function generateThumbnail(
  imageBuffer: Buffer,
  size: ThumbnailSize
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const resized = await sharp(imageBuffer)
    .resize(size.width, null, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(size.format)
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: resized.data,
    width: resized.info.width,
    height: resized.info.height,
  };
}

async function uploadToBlossomServer(buffer: Buffer): Promise<void> {
  await blossomClient.uploadBlob(buffer);
}

async function updateImages() {
  try {
    // Initialize the database connection
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    const imageRepository = AppDataSource.getRepository(Image);
    const thumbnailRepository = AppDataSource.getRepository(Thumbnail);

    // Find images missing sha256 or blurhash
    const imagesNeedingMetadata = await imageRepository.find({
      where: [{ sha256: IsNull() }, { blurhash: IsNull() }],
      relations: ['thumbnails'],
    });

    console.log(
      `Found ${imagesNeedingMetadata.length} images needing metadata updates`
    );

    // Find images missing thumbnails
    const imagesNeedingThumbnails = await imageRepository
      .createQueryBuilder('image')
      .leftJoinAndSelect('image.thumbnails', 'thumbnail')
      .where('thumbnail.id IS NULL')
      .getMany();

    console.log(
      `Found ${imagesNeedingThumbnails.length} images needing thumbnails`
    );

    // Process images needing metadata
    for (const image of imagesNeedingMetadata) {
      try {
        console.log(`Processing metadata for image: ${image.url}`);

        // Download the image
        const imageBuffer = await downloadImage(image.url);

        // Calculate missing values
        if (!image.sha256) {
          image.sha256 = await calculateSha256(imageBuffer);
          console.log(`Calculated SHA256: ${image.sha256}`);
        }

        if (!image.blurhash) {
          image.blurhash = await calculateBlurhash(imageBuffer);
          console.log(`Calculated Blurhash: ${image.blurhash}`);
        }

        // Get image dimensions if missing
        if (!image.width || !image.height) {
          const metadata = await sharp(imageBuffer).metadata();
          image.width = metadata.width?.toString() || '0';
          image.height = metadata.height?.toString() || '0';
          console.log(`Updated dimensions: ${image.width}x${image.height}`);
        }

        // Save the updated image
        await imageRepository.save(image);
        console.log(`Updated metadata for image ${image.id}`);
      } catch (error) {
        if (error instanceof Error) {
          console.error(
            `Error processing metadata for image ${image.url}:`,
            error.message
          );
        } else {
          console.error(
            `Unknown error processing metadata for image ${image.url}`
          );
        }
      }
    }

    // Process images needing thumbnails
    for (const image of imagesNeedingThumbnails) {
      try {
        console.log(`Processing thumbnails for image: ${image.url}`);

        // Download the image
        const imageBuffer = await downloadImage(image.url);

        // Generate thumbnails
        for (const size of THUMBNAIL_SIZES) {
          console.log(`Generating ${size.name} thumbnail...`);
          const { buffer, width, height } = await generateThumbnail(
            imageBuffer,
            size
          );

          const thumbnail = new Thumbnail();
          thumbnail.size = size.name;
          thumbnail.format = size.format;
          thumbnail.width = width.toString();
          thumbnail.height = height.toString();
          thumbnail.sha256 = await calculateSha256(buffer);
          thumbnail.blurhash = await calculateBlurhash(buffer);

          // Upload the thumbnail to Blossom
          await uploadToBlossomServer(buffer);
          console.log(
            `Uploaded thumbnail to Blossom: ${thumbnail.sha256}.${size.format}`
          );

          // Set the URL based on the Blossom server (we already checked it's defined at the top)
          thumbnail.url = `${process.env.BLOSSOM_SERVER}/${thumbnail.sha256}.${size.format}`;
          thumbnail.originalImage = image;

          await thumbnailRepository.save(thumbnail);
          console.log(`Created ${size.name} thumbnail: ${thumbnail.url}`);
        }

        console.log(`Created thumbnails for image ${image.id}`);
      } catch (error) {
        if (error instanceof Error) {
          console.error(
            `Error processing thumbnails for image ${image.url}:`,
            error.message
          );
        } else {
          console.error(
            `Unknown error processing thumbnails for image ${image.url}`
          );
        }
      }
    }

    console.log('Image updates completed');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error during image updates:', error.message);
    } else {
      console.error('Unknown error during image updates');
    }
  } finally {
    // Close the database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('Database connection closed');
    }
  }
}

// Run the script
updateImages().catch((error) => {
  if (error instanceof Error) {
    console.error('Fatal error:', error.message);
  } else {
    console.error('Unknown fatal error occurred');
  }
  process.exit(1);
});
