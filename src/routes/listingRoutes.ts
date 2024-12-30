import { FastifyInstance } from 'fastify';
import { TypesenseService } from '../services/typesenseService';
import { NostrListing } from '../entities/NostrListing';
import { Point } from 'typeorm';
import { resizeForWeb } from '../lib/image_utils.js';

export async function listingRoutes(fastify: FastifyInstance) {
  const typesenseService = new TypesenseService(
    fastify.conf.TYPESENSE_HOST,
    fastify.conf.TYPESENSE_PORT
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
    try {
      const client = typesenseService.getClient();

      const results = await client
        .collections(NostrListing.INDEX_NAME)
        .documents()
        .search({
          q: '*',
          facet_by: '*',
        });
      reply.send(results);
    } catch (error) {
      console.error('Error searching listings:', error);
      reply.status(500).send({ error: 'Error searching listings' });
    }
  });

  fastify.get('/listings/:listingId', async (request, reply) => {
    // const listing = await fastify.db.NostrListing.findOneBy({
    //   id: request.params.listingId,
    // });
    try {
      const client = typesenseService.getClient();

      const listing = await client
        .collections(NostrListing.INDEX_NAME)
        .documents(request.params.listingId)
        .retrieve();

      reply.send(listing);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Could not find')) {
        // Handle ObjectNotFound error
        console.log('Collection or document not found');
        reply.status(404).send({ error: 'Collection or document not found' });
      } else {
        // Handle other errors
        console.log('An unexpected error occurred');
        reply
          .status(500)
          .send({ error: 'An unexpected error occurred' });
      }
    }
  });

  fastify.get('/listings/db/:listingId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      eventId: request.params.listingId,
    });

    if (!listing) {
      reply.callNotFound();
    }

    reply.send(listing);
  });

  fastify.get('/listings/:listingId/image/:imageId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      eventId: request.params.listingId,
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


  fastify.get<{
    Params: {
      listingId: string;
    };
  
  }>('/listings/get_nearby/:listingId', async (request, reply) => {
    const listing = await fastify.db.NostrListing.findOneBy({
      eventId: request.params.listingId,
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

    if (results.hits.length === 0) {
      reply.status(404).send({ error: 'No listings found' });
      return;
    }

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

      if (results.hits.length === 0) {
        reply.status(404).send({ error: 'No listings found' });
        return;
      }

      reply.send(results);
    }
  );
}
