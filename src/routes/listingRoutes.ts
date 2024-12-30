import { FastifyInstance } from 'fastify';
import { TypesenseService } from '../services/typesenseService';
import { NostrListing } from '../entities/NostrListing';
import { Point } from 'typeorm';
import { ZammadService } from '../services/zammadService';
import { resizeForWeb } from '../lib/image_utils.js';

export async function listingRoutes(fastify: FastifyInstance) {
  const typesenseService = new TypesenseService(
    fastify.conf.TYPESENSE_HOST,
    fastify.conf.TYPESENSE_PORT
  );
  const zammadService = new ZammadService(
    fastify.conf.ZAMMAD_HOST,
    fastify.conf.ZAMMAD_API_KEY
  );

  fastify.get('/listings', async (request, reply) => {
    const client = typesenseService.getClient();

    const results = await client
      .collections(NostrListing.INDEX_NAME)
      .documents()
      .search({
        q: '*',
        facet_by: '*',
      });
    reply.send(results);
  });

  fastify.get('/listings/search', async (request, reply) => {
    const client = typesenseService.getClient();

    const results = await client
      .collections(NostrListing.INDEX_NAME)
      .documents()
      .search({
        q: '*',
        facet_by: '*',
      });
    reply.send(results);
  });

  fastify.get('/listings/:listingId', async (request, reply) => {
    // const listing = await fastify.db.NostrListing.findOneBy({
    //   id: request.params.listingId,
    // });
    const client = typesenseService.getClient();

    const listing = await client
      .collections(NostrListing.INDEX_NAME)
      .documents(request.params.listingId)
      .retrieve();

    reply.send(listing);
  });

  fastify.get('/listings/db/:listingId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      id: request.params.listingId,
    });

    reply.send(listing);
  });

  fastify.get('/listings/:listingId/image/:imageId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      id: request.params.listingId,
    });

    if (!listing) {
      reply.callNotFound();
    }

    if (!listing.images[request.params.imageId]) {
      reply.callNotFound();
    }

    const image = await resizeForWeb(listing.images[request.params.imageId]);
    reply.header('Content-Type', 'image/webp');
    reply.send(image);
  });
  //   const results = await client
  //     .collections(NostrListing.INDEX_NAME)
  //     .documents()
  //     .search({
  //       q: '*',
  //       facet_by: '*',
  //     });
  //   reply.send(results);
  // });

  fastify.get('/listings/get_nearby/:listingId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      id: request.params.listingId,
    });

    if (!listing) {
      reply.callNotFound();
    }

    const coord: Point = listing.location;

    const client = typesenseService.getClient();

    const results = await client
      .collections(NostrListing.INDEX_NAME)
      .documents()
      .search({
        hidden_hits: listing.id,
        q: '*',
        filter_by: `location.coordinates: (${coord.coordinates[0]}, ${coord.coordinates[1]}, 15 km)`,
        sort_by: `location.coordinates(${coord.coordinates[0]}, ${coord.coordinates[1]}):asc`,
      });

    // const matchingListings = await fastify.db.NostrListing.findBy(
    //   { id: In(results.hits.map((h) => h.document.id)) },
    //   {
    //     relations: {
    //       images: true,
    //     },
    //   }
    // );

    reply.send(results);
  });

  fastify.get(
    '/listings/geosearch',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            lat: { type: 'string' },
            lon: { type: 'string' },
            dist: { type: 'string', default: '5.1' },
          },
          required: ['lat', 'lon'],
        },
      },
    },
    async (req, reply) => {
      const client = typesenseService.getClient();

      const results = await client
        .collections(NostrListing.INDEX_NAME)
        .documents()
        .search({
          q: '*',
          facet_by: '*',
          filter_by: `location: (${req.query.lat}, ${req.query.lon}, ${req.query.dist} km)`,
          sort_by: `location(${req.query.lat}, ${req.query.lon}):asc`,
        });

      reply.send(results);
    }
  );

  // Add more routes as needed
}
