import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SumsubService } from '../services/sumsubService';
import { verifyEvent, Event } from 'nostr-tools/pure';
import { Type } from '@sinclair/typebox';

// Types
interface SignedMessage extends Event {
  content: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  created_at: number;
  id: string;
  sig: string;
}

interface VerificationRequest {
  Body: {
    signedMessage: SignedMessage;
  };
}

// Validation Schemas
const SignedMessageSchema = Type.Object({
  content: Type.String(),
  pubkey: Type.String(),
  kind: Type.Number(),
  tags: Type.Array(Type.Array(Type.String())),
  created_at: Type.Number(),
  id: Type.String(),
  sig: Type.String(),
});

const VerificationRequestSchema = {
  body: Type.Object({
    signedMessage: SignedMessageSchema,
  }),
  response: {
    200: Type.Object({
      accessToken: Type.String(),
      expiresAt: Type.String(),
    }),
    401: Type.Object({
      error: Type.String(),
    }),
    500: Type.Object({
      error: Type.String(),
    }),
  },
};

export async function verificationRoutes(fastify: FastifyInstance) {
  const sumsubService = new SumsubService();

  // Generate Sumsub WebSDK2 access token
  fastify.post<VerificationRequest>(
    '/verification/token',
    {
      schema: {
        summary: 'Generate Sumsub WebSDK2 Access Token',
        description:
          'Generates a time-limited access token for Sumsub WebSDK2 identity verification',
        tags: ['verification'],
        ...VerificationRequestSchema,
      },
    },
    async (
      request: FastifyRequest<VerificationRequest>,
      reply: FastifyReply
    ) => {
      try {
        const verified = await verifyEvent(request.body.signedMessage);

        if (
          !verified ||
          request.body.signedMessage.content !== 'verify-identity'
        ) {
          return reply
            .code(401)
            .send({ error: 'Invalid signature or verification message' });
        }

        const userId = request.body.signedMessage.pubkey;
        const levelName = 'basic-kyc-level';

        const accessToken = await sumsubService.generateAccessToken(
          userId,
          levelName
        );

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30); // Token expires in 30 minutes

        reply.send({
          accessToken,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        fastify.log.error('Error generating access token:', error);
        reply.code(500).send({ error: 'Failed to generate access token' });
      }
    }
  );
}
