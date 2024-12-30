import { join } from 'path';
import sharp from 'sharp';
import { Image } from '../entities/Image.js';
import { encode } from 'blurhash';
import fs from 'fs/promises';

export const processImage = async (image: Image) => {
  const filePath = join(process.cwd(), 'static', image.url);
  const fileBuffer = await fs.readFile(filePath);
  const file = new File(
    [fileBuffer],
    image.url.split('/').pop() || 'image.jpg'
  );

  // Generate SHA-256 hash of file
  const fileArrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  console.log(
    `Processed ${file.name} with size ${file.size} and hash ${hashHex}`
  );

  image.sha256 = hashHex;
  // Get image dimensions and generate blurhash
  const sharpImage = sharp(fileBuffer);
  const metadata = await sharpImage.metadata();
  const { width, height } = metadata;

  // Generate blurhash
  const { data, info } = await sharpImage
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4,
    4
  );

  return {
    file: file,
    width: width,
    height: height,
    blurhash: blurhash,
    sha256: hashHex,
  };
};

export const resizeForWeb = async (image: Image) => {
  const filePath = join(process.cwd(), 'static', image.url);
  const fileBuffer = await fs.readFile(filePath);

  const sharpImage = sharp(fileBuffer);
  const metadata = await sharpImage.metadata();

  // Calculate height to maintain aspect ratio
  const aspectRatio = metadata.height! / metadata.width!;
  const targetHeight = Math.round(1920 * aspectRatio);

  const resizedBuffer = await sharpImage
    .resize(1920, targetHeight)
    .webp({ quality: 80 })
    .toBuffer();

  return resizedBuffer;
};
