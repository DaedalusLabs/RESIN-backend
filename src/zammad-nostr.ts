import { ZammadClient } from 'zammad-ts-api';
import { config } from 'dotenv';
import NDK, {
  NDKFilter,
  NDKPrivateKeySigner,
  NDKUserProfile,
} from '@nostr-dev-kit/ndk';
import 'websocket-polyfill';
import { sendDirectMessage, unwrapMessage } from './lib/nip44';
import axios from 'axios';
import sharp from 'sharp';
import { AppDataSource } from './config/db';
import { ZammadNostrResponse } from './entities/ZammadNostrResponse';

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

class NostrZammadBridge {
  private zammadClient: ZammadClient;

  constructor(url: string, token: string) {
    this.zammadClient = new ZammadClient(url, { token: token });
  }

  async getOrCreateZammadUser(pubkey: string, profile?: NDKUserProfile) {
    const userParams = {
      email: `${pubkey}@nostr.bridge`,
      login: pubkey,
      firstname: profile && profile.displayName ? profile.displayName : 'Nostr',
      lastname: `User ${pubkey.slice(0, 8)}`,
      note: pubkey,
    };

    let user;
    const users = await this.zammadClient.user.search({ query: pubkey });

    if (users.length) {
      user = users.at(0);
    } else {
      user = await this.zammadClient.user.create(userParams);
    }

    if (profile) {
      if (profile.image) {
        try {
          // Download the image
          const imageResponse = await axios({
            url: profile.image,
            method: 'GET',
            responseType: 'arraybuffer',
          });
          const imageBuffer = Buffer.from(imageResponse.data);

          // Create full size and resized versions using sharp
          const fullSizeBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 90 })
            .toBuffer();

          const resizedBuffer = await sharp(imageBuffer)
            .resize(140, 140, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer();

          // Convert both versions to base64
          const avatarFull = `data:image/jpeg;base64,${fullSizeBuffer.toString('base64')}`;
          const avatarResize = `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;

          // Upload the avatar
          const uploadResponse = await axios.post(
            `${process.env.ZAMMAD_HOST}/api/v1/users/avatar`,
            {
              user_id: user?.id,
              avatar_full: avatarFull,
              avatar_resize: avatarResize,
            },
            {
              headers: {
                Authorization: `Token token=${process.env.ZAMMAD_API_KEY}`,
                'Content-Type': 'application/json; charset=utf-8',
                'X-On-Behalf-Of': user?.id,
              },
            }
          );
        } catch (error) {
          console.error('Error processing avatar:', error);
          throw error;
        }
      }
    }

    return user;
  }

  async updateArticleReferenceId(
    ticketId: number,
    articleId: number,
    newReferenceId: string
  ) {
    const endpoint = `/api/v1/ticket_articles/${articleId}`;
    const payload = {
      ticket_id: ticketId,
      reference_id: newReferenceId,
    };

    try {
      const response = await this.zammadClient.doPutCall(endpoint, payload);
      return response;
    } catch (error) {
      console.error('Error updating article reference ID:', error);
      throw error;
    }
  }

  async getAllOpenTickets() {
    const openTickets = await this.zammadClient.ticket.search({
      query: `(state.name: open OR state.name: new)`,
    });
    const nostrResponses = AppDataSource.getRepository(ZammadNostrResponse);

    for (const t of openTickets.tickets) {
      try {
        const articles = await this.zammadClient.article.getByTicketId(t);
        const user = openTickets.assets.Ticket[t].customer_id;
        for (const a of articles) {
          const nostrReponse = await nostrResponses.findBy({ articleId: a.id });

          if (
            a.sender == 'Agent' &&
            a.references == null &&
            !nostrReponse.length &&
            !a.internal
          ) {
            const c = await this.zammadClient.user.getById(user);

            const r = new ZammadNostrResponse();
            r.articleId = a.id;
            r.ticketId = t;

            console.log(a);

            const eventId = await sendDirectMessage(c.login, a.body, ndk);
            r.eventId = eventId;

            nostrResponses.save(r);
          }
        }
      } catch {
        /* empty */
      }
    }
  }

  async createTicket(nostrEvent, profile?: NDKUserProfile) {
    // console.log(nostrEvent);
    // return;
    const customer = await this.getOrCreateZammadUser(
      nostrEvent.pubkey,
      profile
    );

    if (!customer) {
      console.log(`No customer found for pubkey ${nostrEvent.pubkey}`);
      return;
    }

    const customer_id = customer.id;

    const exists = await this.zammadClient.ticket.search({
      query: `${nostrEvent.id}`,
    });

    if (exists.tickets?.length) {
      return;
    }

    const ticketsByUser = await this.zammadClient.ticket.search({
      query: `customer.id:${customer_id} AND (state.name: open OR state.name: new)`,
    });

    if (ticketsByUser.tickets?.length) {
      console.log('update bestaand customer id', customer_id);
      this.zammadClient.article.create(
        {
          ticket_id: ticketsByUser.tickets[0],
          subject: 'Nostr Message',
          body: nostrEvent.content,
          references: nostrEvent.id,
          type: 'note',
          internal: false,
          sender: 'Customer',
        },
        {
          headers: {
            'X-On-Behalf-Of': customer_id,
          },
        }
      );
    } else {
      console.log('maak nieuwe aan', ticketsByUser, customer_id);

      return await this.zammadClient.ticket.create(
        {
          title: `Nostr Message`,
          group_id: 1,
          customer_id: customer_id,
          nostr_eventid: nostrEvent.id,

          article: {
            subject: 'Nostr Message',
            body: nostrEvent.content,
            references: nostrEvent.id,
            type: 'note',
            internal: false,
            sender: 'Customer',
          },
        },
        {
          headers: {
            'X-On-Behalf-Of': customer_id,
          },
        }
      );
    }
  }
}

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
    since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 0.5, // Last 7 days
  };

  const messages = await ndk.subscribe(filter, { closeOnEose: false });

  const bridge = new NostrZammadBridge(
    process.env.ZAMMAD_HOST,
    process.env.ZAMMAD_API_KEY
  );

  messages.on('event', async (e) => {
    const u = await unwrapMessage(e, ndk);
    const profile = await u.user.profile;
    console.log(`New message from ${u.pubkey} content: ${u.content}`);

    if (u.pubkey == pubKey) return;
    try {
      await bridge.createTicket(
        {
          pubkey: u.pubkey,
          id: u.id,
          content: u.content,
        },
        profile
      );
    } catch {
      console.log(
        `Error creating ticket for ${u.pubkey} content: ${u.content}`
      );
    }
    //        console.log(u.pubkey, await u.user.profile);
  });

  setInterval(() => {
    bridge.getAllOpenTickets();
  }, 15 * 1000);
  bridge.getAllOpenTickets();
})();
