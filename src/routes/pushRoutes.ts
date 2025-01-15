import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  WebPushService,
  PushSubscription,
} from '../services/webPushService.js';

const subscriptionSchema = Type.Object(
  {
    endpoint: Type.String(),
    keys: Type.Object({
      p256dh: Type.String(),
      auth: Type.String(),
    }),
    nostrPubkey: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
  },
  { $id: 'PushSubscription' }
);

const notificationSchema = Type.Object({
  subscription: Type.Object({
    endpoint: Type.String(),
    keys: Type.Object({
      p256dh: Type.String(),
      auth: Type.String(),
    }),
  }),
  payload: Type.Object({
    title: Type.String(),
    body: Type.String(),
    icon: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
});

const broadcastSchema = Type.Object({
  payload: Type.Object({
    title: Type.String(),
    body: Type.String(),
    icon: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
  nostrPubkey: Type.Optional(Type.String()),
});

interface SubscriptionBody extends PushSubscription {
  nostrPubkey?: string;
  label?: string;
}

interface NotificationBody {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  payload: {
    title: string;
    body: string;
    icon?: string;
    data?: Record<string, unknown>;
  };
}

interface BroadcastBody {
  payload: {
    title: string;
    body: string;
    icon?: string;
    data?: Record<string, unknown>;
  };
  nostrPubkey?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    webPushService: WebPushService;
  }
}

export async function pushRoutes(fastify: FastifyInstance) {
  // Get VAPID public key
  fastify.get(
    '/push/vapid-public-key',
    {
      schema: {
        response: {
          200: Type.Object({
            publicKey: Type.String(),
          }),
        },
      },
    },
    async () => {
      return { publicKey: fastify.webPushService.getPublicKey() };
    }
  );

  // Subscribe to push notifications
  fastify.post<{ Body: SubscriptionBody }>(
    '/push/subscribe',
    {
      schema: {
        body: subscriptionSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
          }),
        },
      },
    },
    async (request) => {
      try {
        await fastify.webPushService.saveSubscription(
          request.body,
          request.body.nostrPubkey,
          request.body.label
        );
        return { success: true };
      } catch (error) {
        request.log.error(error);
        throw error;
      }
    }
  );

  // Get subscriptions by Nostr pubkey
  fastify.get(
    '/push/subscriptions/:nostrPubkey',
    {
      schema: {
        params: Type.Object({
          nostrPubkey: Type.String(),
        }),
        response: {
          200: Type.Array(
            Type.Object({
              endpoint: Type.String(),
              label: Type.Optional(Type.String()),
              createdAt: Type.String(),
              updatedAt: Type.String(),
            })
          ),
        },
      },
    },
    async (request) => {
      const { nostrPubkey } = request.params as { nostrPubkey: string };
      const subscriptions =
        await fastify.webPushService.getSubscriptionsByPubkey(nostrPubkey);
      return subscriptions.map((sub) => ({
        endpoint: sub.endpoint,
        label: sub.label,
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
      }));
    }
  );

  // Deactivate all subscriptions for a Nostr pubkey
  fastify.delete(
    '/push/subscriptions/:nostrPubkey',
    {
      schema: {
        params: Type.Object({
          nostrPubkey: Type.String(),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
          }),
        },
      },
    },
    async (request) => {
      const { nostrPubkey } = request.params as { nostrPubkey: string };
      await fastify.webPushService.deactivateAllPubkeySubscriptions(
        nostrPubkey
      );
      return { success: true };
    }
  );

  // Send push notification to a specific subscription
  fastify.post<{ Body: NotificationBody }>(
    '/push/send',
    {
      schema: {
        body: notificationSchema,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { subscription, payload } = request.body;

      try {
        await fastify.webPushService.sendNotification(subscription, payload);
        return { success: true };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to send notification',
        });
      }
    }
  );

  // Broadcast notification to all active subscriptions
  fastify.post<{ Body: BroadcastBody }>(
    '/push/broadcast',
    {
      schema: {
        body: broadcastSchema,
        response: {
          200: Type.Object({
            succeeded: Type.Number(),
            failed: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { payload, nostrPubkey } = request.body;

      try {
        const result = await fastify.webPushService.broadcastNotification(
          payload,
          nostrPubkey
        );
        return result;
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to broadcast notification',
        });
      }
    }
  );
}
