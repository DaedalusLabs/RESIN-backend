import { NostrListing } from './entities/NostrListing';
import { AppDataSource } from './config/db';

import { config } from 'dotenv';
import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nostrRelays } from './config/nostrRelays';
import { BlossomClient, EventTemplate } from 'blossom-client-sdk';
import { UnsignedEvent, getEventHash } from 'nostr-tools';
import { processImage } from './lib/image_utils.js';

config();

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

async function listBlobs() {
  const pubKey = (await signer.user()).pubkey;

  try {
    return blossomClient.listBlobs(pubKey);
  } catch (e) {
    if (e.status === 401) {
      const auth = await BlossomClient.createListAuth(
        signer,
        'List Blobs from ' + server
      );
      return BlossomClient.listBlobs(server, pubkey, undefined, auth);
    }
  }
}

async function uploadMedia() {
  await AppDataSource.initialize();

  const blobs = await listBlobs();
  console.log('Current blobs', blobs);

  try {
    const listingRepository = AppDataSource.getRepository(NostrListing);
    const listings = await listingRepository.find();
    for (const listing of listings) {
      const uploadedFiles = [];

      for (const image of listing.images) {
        try {
          const { file, sha256 } = await processImage(image);
          const foundBlob = blobs?.find((b) => b.sha256 === sha256);
          if (foundBlob) {
            console.log(`Blob ${foundBlob.sha256} already exists`);
          } else {
            const blob = await blossomClient.uploadBlob(file);
            console.log(`Uploaded ${blob.url}`);
            uploadedFiles.push(blob.url);
          }
        } catch (error) {
          console.error(`Error processing image ${image.url}:`, error);
        }
      }
      console.log(`Uploaded ${uploadedFiles.length} files`);
    }
    console.log(`Reindexed ${listings.length} listings`);
  } catch (error) {
    console.error('Error during reindexing:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

uploadMedia()
  .then(() => {
    console.log('Import completed');
  })
  .catch((error) => {
    console.error('Import failed:', error);
  });
