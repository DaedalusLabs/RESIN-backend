import { config } from 'dotenv';
import NDK, { NDKFilter, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';
import { sendDirectMessage, unwrapMessage } from './lib/nip44';
import { AppDataSource } from './config/db';

config();

const nostrRelays = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://nostr.dbtc.link',
  'wss://nostr1.daedaluslabs.io',
  'wss://nostr2.daedaluslabs.io',
  'wss://nostr3.daedaluslabs.io',
];

const signer = new NDKPrivateKeySigner(process.env.NOSTR_PRIVKEY);
const ndk = new NDK({ signer: signer, explicitRelayUrls: nostrRelays });

(async () => {
  // const pool = new NPool({
  //     open(url) {
  //         return new NRelay1(url);
  //     },
  //     async reqRelays(filters) {
  //         return nostrRelays;
  //     },
  //     async eventRelays(event) {
  //         return nostrRelays;
  //     },
  // })
  await AppDataSource.initialize();

  await ndk.connect();

  const pubKey = (await signer.user()).pubkey;

  console.log(`Public key is ${pubKey}`);
  const filter: NDKFilter = {
    kinds: [1059], // Gift wrap kind
    '#p': [pubKey],
    since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 0.24, // Last 7 days
  };

  const messages = await ndk.subscribe(filter, { closeOnEose: false });

  messages.on('event', async (e) => {
    const u = await unwrapMessage(e, ndk);
    const profile = await u.user.profile;

    if (u.pubkey == pubKey) return;
    try {
      console.log(`Sending message to ${u.pubkey}`);
      sendDirectMessage(u.pubkey, `Hello from Nostr ${u.pubkey}`, ndk);
    } catch {
      /* empty */
    }
    //        console.log(u.pubkey, await u.user.profile);
  });
})();
