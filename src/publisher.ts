import { config } from 'dotenv';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';
import { AppDataSource } from './config/db';
import { NostrListing } from './entities/NostrListing.js';
import data from '../bch.json';

config();

const nostrRelays = [
    // 'wss://nostr.dbtc.link',
    'wss://nostr1.daedaluslabs.io',
    'wss://nostr2.daedaluslabs.io',
    'wss://nostr3.daedaluslabs.io',
    'wss://nostr4.daedaluslabs.io',
];

const signer = new NDKPrivateKeySigner(process.env.NOSTR_PRIVKEY);
const ndk = new NDK({ signer: signer, explicitRelayUrls: nostrRelays, autoConnectUserRelays: false });

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
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const listingRepository = AppDataSource.getRepository(NostrListing);
    const listings = await listingRepository.find();
    for (const listing of listings) {
      let newEvent = listing.asNostrEvent();
      delete newEvent.id;
      delete newEvent.pubkey;
      delete newEvent.created_at;

      try {
      const event = new NDKEvent(ndk);
      event.kind = 30403;
      event.content = newEvent.content;
      event.tags = newEvent.tags;

      await event.sign();
                  let relays = await event.publish();
      //            console.log('event',await event.rawEvent());
                  console.log(`${event.tagValue('title')} : ${event.id}`)

        listing.eventId = event.id;
        await listingRepository.save(listing);
                  console.log('relays', relays.size);
                  // console.log(`Published event ${event.id}`);
    }    
      catch (error) {
        console.error('Error during importing:', error);
      }
      
    }

//     for (const l of data) {
//         try {
//             let newEvent = l;
//             delete newEvent.id;
//             delete newEvent.pubkey;
//             delete newEvent.created_at;

//             newEvent.tags['d'] = newEvent.tags['g'];

//             newEvent.kind = 30403;
//             const event = new NDKEvent(ndk);
//             event.kind = newEvent.kind;
//             event.content = newEvent.content;
//             event.tags = newEvent.tags.map((tag: string[]) => {
//                 if (typeof tag[1] === 'boolean') {
//                     tag[1] = String(tag[1]);
//                 }
//                 return tag;
//             });
            
       

//             await event.sign();
// //            let relays = await event.publish();
// //            console.log('event',await event.rawEvent());
//          //   console.log(`${event.tagValue('title')} : ${event.id}`)
//             //console.log('relays', relays.size);
//             // console.log(`Published event ${event.id}`);
//         }

//         catch (error) {
//             console.error('Error during importing:', error.message);
//         }
    // }
})()
