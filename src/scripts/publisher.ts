import { config } from 'dotenv';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';
import { AppDataSource } from '../config/db.js';
import { NostrListing } from '../entities/NostrListing.js';
import { QueryFailedError } from 'typeorm';
import { nostrRelays } from '../config/nostrRelays.js';

config();

const signer = new NDKPrivateKeySigner(process.env.NOSTR_PRIVKEY);
const ndk = new NDK({
  signer: signer,
  explicitRelayUrls: nostrRelays,
  autoConnectUserRelays: false,
});

ndk.pool.on('relay:connect', (relay) => {
  console.log(`Connected to ${relay.url}`);
});

(async () => {
  await AppDataSource.initialize();

  await ndk.connect();

  // The ndk.connect() promise does not wait until we are connected to at least one relay
  // So we need to wait until we are connected to at least one relay before we start publishing
  let connectedRelays = 0;
  ndk.pool.on('relay:connect', () => {
    connectedRelays++;
  });
  ndk.pool.on('relay:disconnect', () => {
    connectedRelays--;
  });
  while (connectedRelays === 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const listingRepository = AppDataSource.getRepository(NostrListing);
  const listings = await listingRepository.find();
  const processedEventIds = new Set();

  for (const listing of listings) {
    const { content, tags } = listing.asNostrEvent();

    try {
      const event = new NDKEvent(ndk);
      event.kind = 30403;
      event.content = content;
      event.tags = tags;

      await event.sign();

      // Skip if we've already processed this event ID
      if (processedEventIds.has(event.id)) {
        console.log(`Skipping duplicate event ID: ${event.id}`);
        continue;
      }
      processedEventIds.add(event.id);

      const relays = await event.publish();
      console.log(`${event.tagValue('title')} : ${event.id}`);

      // Only update if the eventId is different
      if (listing.eventId !== event.id) {
        listing.eventId = event.id;
        await listingRepository.save(listing);
      }
      console.log('relays', relays.size);
    } catch (error) {
      if (error instanceof QueryFailedError && error.message.includes('23505')) {
        // Unique constraint violation
        console.log(`Skipping duplicate eventId for listing ${listing.id}`);
      } else {
        console.error('Error during publishing:', error);
      }
    }
  }
})();
