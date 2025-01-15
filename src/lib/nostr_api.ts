import NDK, {
  NDKEvent,
  NDKFilter,
  NDKSubscriptionOptions,
  NDKUser,
} from '@nostr-dev-kit/ndk';

export enum commands {
  get_transactions = 'get_transactions',
  get_agreements = 'get_agreements',
  get_properties = 'get_properties',
}

export const REQUEST_KIND = 24194 as number;
export const RESPONSE_KIND = 24195 as number;

export type NostrAPIRequest = {
  method: commands;
  params?: Record<string, unknown>;
};

export type NostrAPIResponse<T> = {
  result_type: commands;
  result: T;
};

export class NostrAPI {
  constructor(private ndk: NDK) {}

  // Method to send a request and wait for response
  async request<T>(
    targetPubkey: string,
    method: commands,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.ndk.signer) {
      throw new Error('NDK instance must have a signer to make requests');
    }

    const request: NostrAPIRequest = {
      method,
      params,
    };

    const targetUser = new NDKUser({ pubkey: targetPubkey });
    targetUser.ndk = this.ndk;

    // Encrypt the request
    const encryptedContent = await this.ndk.signer.encrypt(
      targetUser,
      JSON.stringify(request)
    );

    // Create and publish request event
    const event = new NDKEvent(this.ndk);
    event.kind = REQUEST_KIND;
    event.content = encryptedContent;
    event.tags = [['p', targetPubkey]];
    await event.publish();

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
        subscription.stop();
      }, 30000);

      const filter: NDKFilter = {
        kinds: [RESPONSE_KIND],
        '#e': [event.id!],
        authors: [targetPubkey],
      };

      const subOptions: NDKSubscriptionOptions = { closeOnEose: false };
      const subscription = this.ndk.subscribe(filter, subOptions);

      subscription.on('event', async (event: NDKEvent) => {
        try {
          if (!this.ndk.signer) throw new Error('No signer available');

          const sender = new NDKUser({ pubkey: event.pubkey });
          sender.ndk = this.ndk;

          const decrypted = await this.ndk.signer.decrypt(
            sender,
            event.content
          );
          const response = JSON.parse(decrypted) as NostrAPIResponse<T>;
          console.log('Decrypted response:', response);
          clearTimeout(timeout);
          resolve(response.result);
          subscription.stop();
        } catch (error) {
          console.error('Error processing response:', error);
        }
      });
    });
  }

  // Method to handle incoming requests and send responses
  async handleRequests(
    handler: (
      method: commands,
      params?: Record<string, unknown>
    ) => Promise<unknown>
  ): Promise<void> {
    if (!this.ndk.signer) {
      throw new Error('NDK instance must have a signer to handle requests');
    }

    const user = await this.ndk.signer.user();
    const filter: NDKFilter = {
      kinds: [REQUEST_KIND],
      '#p': [user.pubkey],
    };
    console.log('Subscribing to requests for:', user.pubkey);
    const subOptions: NDKSubscriptionOptions = { closeOnEose: false };
    const subscription = this.ndk.subscribe(filter, subOptions);

    subscription.on('event', async (event: NDKEvent) => {
      console.log(
        'Received event:',
        event.id,
        'via',
        event.onRelays.map((r) => r.url)
      );
      try {
        if (!this.ndk.signer) throw new Error('No signer available');

        const sender = new NDKUser({ pubkey: event.pubkey });
        sender.ndk = this.ndk;

        const decrypted = await this.ndk.signer.decrypt(sender, event.content);
        const request = JSON.parse(decrypted) as NostrAPIRequest;
        request.params = { pubkey: event.pubkey };
        // Process the request
        const result = await handler(request.method, request.params);

        // Create response
        const response: NostrAPIResponse<unknown> = {
          result_type: request.method,
          result,
        };

        // Encrypt and send response
        const encryptedContent = await this.ndk.signer.encrypt(
          sender,
          JSON.stringify(response)
        );

        const responseEvent = new NDKEvent(this.ndk);
        responseEvent.kind = RESPONSE_KIND;
        responseEvent.content = encryptedContent;
        responseEvent.tags = [
          ['e', event.id!],
          ['p', event.pubkey],
        ];

        await responseEvent.publish();
      } catch (error) {
        console.error('Error handling request:', error);
      }
    });
  }

  // Helper method to get the public key if available
  async getPublicKey(): Promise<string | undefined> {
    if (!this.ndk.signer) return undefined;
    const user = await this.ndk.signer.user();
    return user.pubkey;
  }
}
