import fp from 'fastify-plugin';
import { NostrListing } from '../entities/NostrListing';
import { AppDataSource } from '../config/db';
import { Agent } from 'http';
import { Agreement } from '../entities/Agreement.js';
import { NostrUser } from '../entities/NostrUser.js';
import { Property } from '../entities/Property.js';
import { Transaction } from '../entities/Transaction.js';
import { Image } from '../entities/Image.js';
export const TypeOrmFastifyPlugin = fp(async (fastify) => {
  const dataSource = AppDataSource;

  await dataSource.initialize();

  fastify.decorate('db', {
    dataSource,
    NostrListing: dataSource.getRepository(NostrListing),
    Property: dataSource.getRepository(Property),
    Image: dataSource.getRepository(Image),
    Agent: dataSource.getRepository(Agent),
    NostrUser: dataSource.getRepository(NostrUser),
    Agreement: dataSource.getRepository(Agreement),
    Transaction: dataSource.getRepository(Transaction),
  });
});
