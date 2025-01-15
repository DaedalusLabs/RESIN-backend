import { config } from 'dotenv';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';
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
  await ndk.connect();

  // Wait until connected to at least one relay
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

  const user = await ndk.signer?.user();
  const pubkey = user?.pubkey;
  // Fetch all events of kind 30402 and 30403 authored by us
  const filter = {
    kinds: [30402, 30403],
    authors: [pubkey],
  };

  console.log('Fetching events...', pubkey);
  const events = await ndk.fetchEvents(filter);
  console.log(`Found ${events.size} events to delete`);

  for (const event of events) {
    try {
      // Create a kind 5 deletion event
      const deleteEvent = new NDKEvent(ndk);
      deleteEvent.kind = 5;
      deleteEvent.tags = [
        ['e', event.id], // Reference the event to delete
        ['a', `${event.kind}:${event.pubkey}:${event.tagValue('d')}`], // Reference the parameterized replaceable event
      ];

      await deleteEvent.sign();
      const relays = await deleteEvent.publish();
      console.log(
        `Unpublished listing ${event.tagValue('title')} (${event.id})`
      );
      console.log('Published to relays:', relays.size);
    } catch (error) {
      console.error('Error during unpublishing:', error);
    }
  }

  console.log('Unpublishing complete');
  process.exit(0);
})();
