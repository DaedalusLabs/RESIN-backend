import fp from 'fastify-plugin';
import { NostrListing } from '../entities/NostrListing';
import { AppDataSource } from '../config/db';

export const TypeOrmFastifyPlugin = fp(async (fastify) => {
  const dataSource = AppDataSource;

  await dataSource.initialize();

  fastify.decorate('db', {
    dataSource,
    NostrListing: dataSource.getRepository(NostrListing),
  });
});
