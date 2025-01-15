import { FastifyInstance } from 'fastify';
import { encryptMessage } from '../lib/nostr_encrypt.js';
import { Property } from '../entities/Property.js';
import { Transaction } from '../entities/Transaction.js';
import { Agreement } from '../entities/Agreement.js';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/user/info',
    { schema: { body: { type: 'object', required: ['pubKey'] } } },
    async (request, reply) => {
      console.log(request.body);
      const encryptedMessage = await encryptMessage(
        'b5127a08cf33616274800a4387881a9f98e04b9c37116e92de5250498635c422',
        'test'
      );
      console.log('Encrypted message: ', encryptedMessage);
      reply.send(encryptedMessage);
    }
  );

  // Get properties owned by user
  fastify.get(
    '/user/properties',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey } = request.query as { pubkey: string };

      const properties = await fastify.orm
        .getRepository(Property)
        .createQueryBuilder('property')
        .innerJoinAndSelect('property.owners', 'owner')
        .leftJoinAndSelect('property.listings', 'listing')
        .where('owner.pubkey = :pubkey', { pubkey })
        .getMany();

      reply.send(properties);
    }
  );

  // Get transactions for user
  fastify.get(
    '/user/transactions',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey } = request.query as { pubkey: string };

      const transactions = await fastify.orm
        .getRepository(Transaction)
        .createQueryBuilder('transaction')
        .innerJoinAndSelect('transaction.property', 'property')
        .leftJoinAndSelect('transaction.payment', 'payment')
        .where('transaction.user.pubkey = :pubkey', { pubkey })
        .getMany();

      reply.send(transactions);
    }
  );

  // Get agreements for user
  fastify.get(
    '/user/agreements',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['pubkey'],
          properties: {
            pubkey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { pubkey } = request.query as { pubkey: string };

      const agreements = await fastify.orm
        .getRepository(Agreement)
        .createQueryBuilder('agreement')
        .innerJoinAndSelect('agreement.property', 'property')
        .where('agreement.user.pubkey = :pubkey', { pubkey })
        .getMany();

      reply.send(agreements);
    }
  );
}
