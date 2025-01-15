import NDK, {
  NDKPrivateKeySigner,
  NDKFilter,
  NDKEvent,
  NDKKind,
  NostrEvent,
} from '@nostr-dev-kit/ndk';
import { NostrListing } from '../entities/NostrListing.js';
import { AppDataSource } from '../config/db.js';
import { nostrRelays } from '../config/nostrRelays.js';
import mainLogger from './logger.js';
import { config } from 'dotenv';
import { NostrAPI, commands } from '../lib/nostr_api.js';
import { Property } from '../entities/Property.js';
import { Transaction } from '../entities/Transaction.js';
import { Agreement } from '../entities/Agreement.js';
import { NostrEventHistory } from '../entities/NostrEventHistory.js';

const logger = mainLogger.child({ module: 'nostr' });
config();

export class NostrService {
  private ndk: NDK;
  private signer: NDKPrivateKeySigner;
  private api: NostrAPI;
  private listingRepository = AppDataSource.getRepository(NostrListing);
  private propertyRepository = AppDataSource.getRepository(Property);
  private transactionRepository = AppDataSource.getRepository(Transaction);
  private agreementRepository = AppDataSource.getRepository(Agreement);
  whitelistedPubkeys: string[] = [];

  constructor() {
    const privateKey = process.env.NOSTR_PRIVKEY;
    if (!privateKey) {
      throw new Error('NOSTR_PRIVKEY environment variable is not set');
    }
    this.signer = new NDKPrivateKeySigner(privateKey);
    this.ndk = new NDK({
      explicitRelayUrls: nostrRelays,
      signer: this.signer,
      autoConnectUserRelays: false,
    });
    this.api = new NostrAPI(this.ndk);
  }

  async start() {
    this.whitelistedPubkeys = [
      ...(process.env.PUBKEY_WHITELIST || '').split(','),
      (await this.signer.user()).pubkey,
    ];

    this.ndk.pool.on('relay:connect', (relay) => {
      logger.info(`Connected to ${relay.url}`);
    });
    await this.ndk.connect();
    logger.info('Connected to NDK relays');

    // Start handling API requests
    await this.setupAPIHandlers();

    // Setup listing subscriptions
    await this.setupListingSubscriptions();

    // Setup deletion subscriptions
    await this.setupDeletionSubscriptions();

    logger.info('Subscribed to listing and deletion events');
  }

  private async setupAPIHandlers() {
    await this.api.handleRequests(async (method, params) => {
      const pubkey = params?.pubkey as string;
      if (!pubkey) throw new Error('pubkey parameter is required');

      console.log('method:', method);
      switch (method) {
        case commands.get_properties:
          return await this.propertyRepository
            .createQueryBuilder('property')
            .innerJoinAndSelect('property.owners', 'owner')
            .leftJoinAndSelect('property.listings', 'listing')
            .where('owner.pubkey = :pubkey', { pubkey })
            .getMany();

        case commands.get_transactions:
          return await this.transactionRepository
            .createQueryBuilder('transaction')
            .innerJoinAndSelect('transaction.property', 'property')
            .leftJoinAndSelect('transaction.payment', 'payment')
            .where('transaction.user.pubkey = :pubkey', { pubkey })
            .getMany();

        case commands.get_agreements:
          return await this.agreementRepository
            .createQueryBuilder('agreement')
            .innerJoinAndSelect('agreement.property', 'property')
            .where('agreement.user.pubkey = :pubkey', { pubkey })
            .getMany();

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    });
    logger.info('API handlers setup complete');
  }

  private async setupListingSubscriptions() {
    const filter: NDKFilter = {
      kinds: [30403 as NDKKind],
    };

    const sub = this.ndk.subscribe(filter, { closeOnEose: false });

    sub.on('event', async (event: NDKEvent) => {
      try {
        const rawEvent = event.rawEvent();
        if (!rawEvent.kind) {
          logger.error(`Event ${event.id} has no kind`);
          return;
        }
        const listing = NostrListing.fromNostrEvent(rawEvent as NostrEvent);
        const tagValue = event.tagValue('title');
        logger.info(
          `Listing ${event.kind}: ${tagValue} by ${event.pubkey}\r\nSeen on ${event.relay?.url}\r\nEvent ID: ${event.id}`
        );

        const existingListing = await this.listingRepository.findOneBy({
          eventId: listing.eventId,
        });

        if (!existingListing) {
          if (this.whitelistedPubkeys.includes(event.pubkey)) {
            // Start a transaction to ensure both saves happen atomically
            await AppDataSource.transaction(
              async (transactionalEntityManager) => {
                // First save the listing and get the saved entity back
                const savedListing = await transactionalEntityManager
                  .getRepository(NostrListing)
                  .save(listing);

                // Then create and save the event history using the same transaction
                const history = new NostrEventHistory();
                history.eventId = savedListing.eventId;
                history.listing = savedListing;
                await transactionalEntityManager
                  .getRepository(NostrEventHistory)
                  .save(history);

                logger.info(
                  `Saved listing and event history for ${savedListing.eventId}`
                );
              }
            );
          }
        } else {
          logger.info(
            `Listing ${listing.title} with eventId ${listing.eventId} already exists`
          );
        }
      } catch (error) {
        logger.error(`Error processing event ${event.id}:`, error);
        console.error(error); // Use console.error for better error formatting
      }
    });
  }

  private async setupDeletionSubscriptions() {
    const deleteFilter: NDKFilter = {
      kinds: [5 as NDKKind],
      authors: this.whitelistedPubkeys,
    };

    const deleteSub = this.ndk.subscribe(deleteFilter, { closeOnEose: false });

    deleteSub.on('event', async (event: NDKEvent) => {
      try {
        // Check if this is a deletion for our listing kinds
        const aTag = event.tags.find((tag) => tag[0] === 'a');
        if (!aTag) return;

        const [kind, pubkey, d] = aTag[1].split(':');
        if (!kind || !pubkey || !d) return;

        // Only process deletions for our listing kinds
        if (![30402, 30403].includes(Number(kind))) return;

        // Only process deletions from whitelisted pubkeys
        if (!this.whitelistedPubkeys.includes(pubkey)) return;

        // Find the listing in our database
        const listing = await this.listingRepository.findOneBy({
          eventId: event.id,
        });
        if (listing) {
          logger.info(
            `Deleting listing ${listing.title} (${listing.eventId}) due to deletion event`
          );
          await this.listingRepository.remove(listing);
          // The @AfterRemove hook in NostrListing will handle Typesense deletion
        }
      } catch (error) {
        logger.error(`Error processing deletion event ${event.id}:`, error);
        console.log(error);
      }
    });
  }

  async stop() {
    //await this.ndk.close();
    console.log('Closed NDK connection');
  }
}
