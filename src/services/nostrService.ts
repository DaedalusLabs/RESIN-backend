import NDK, { NDKPrivateKeySigner, NDKFilter, NDKEvent } from '@nostr-dev-kit/ndk';
import { NostrListing } from '../entities/NostrListing';
import { AppDataSource } from '../config/db';
import { nostrRelays } from '../config/nostrRelays.js';

export class NostrService {
  private ndk: NDK;
  private signer: NDKPrivateKeySigner;
  private listingRepository = AppDataSource.getRepository(NostrListing);

  constructor() {
    const privateKey = process.env.NOSTR_PRIVKEY;
    if (!privateKey) {
      throw new Error('NOSTR_PRIVKEY environment variable is not set');
    }
    
    this.signer = new NDKPrivateKeySigner(privateKey);
    this.ndk = new NDK({
      explicitRelayUrls: nostrRelays,
      signer: this.signer,
      autoConnectUserRelays: false
    });
  }

  async start() {
    this.ndk.pool.on('relay:connect', (relay) => {
      console.log(`Connected to ${relay.url}`);
    });
    await this.ndk.connect();
    console.log('Connected to NDK relays');

    const filter: NDKFilter = {
      kinds: [30403]
    };

    let sub = this.ndk.subscribe(filter, {
      closeOnEose: false });


    sub.on('event', async (event: NDKEvent) => {
        try {
          const listing = NostrListing.fromNostrEvent(event.rawEvent());
          //await this.listingRepository.save(listing);
          const tagValue = event.tagValue('title');
          console.log(`Listing ${event.kind}: ${tagValue} by ${event.pubkey}\r\nSeen on ${event.relay.url}\r\nEvent ID: ${event.id}`);
        } catch (error) {
          console.error(`Error processing event ${event.id}:`, error);
        }
      }
    );

    console.log('Subscribed to listing events');
  }

  async stop() {
    await this.ndk.close();
    console.log('Closed NDK connection');
  }
}
