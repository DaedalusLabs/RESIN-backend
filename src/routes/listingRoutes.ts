import { FastifyInstance, FastifyReply } from 'fastify';
import { TypesenseService } from '../services/typesenseService';
import { NostrListing } from '../entities/NostrListing';
import { Point } from 'typeorm';
import { resizeForWeb } from '../lib/image_utils.js';
import { Type } from '@sinclair/typebox';

// Request/Response Types
type ListingParams = {
  listingId: string;
} & Partial<{
  imageId: string;
  eventId: string;
}>;

interface GeoSearchQuery {
  lat: string;
  lon: string;
  dist?: string;
}

// Schemas for request validation
const ListingParamsSchema = {
  type: 'object',
  properties: {
    listingId: { type: 'string' },
    imageId: { type: 'string' },
    eventId: { type: 'string' },
  },
  required: ['listingId'],
};

const GeoSearchQuerySchema = {
  type: 'object',
  properties: {
    lat: { type: 'string' },
    lon: { type: 'string' },
    dist: { type: 'string', default: '5.1' },
  },
  required: ['lat', 'lon'],
};

export async function listingRoutes(fastify: FastifyInstance) {
  const typesenseService = new TypesenseService(
    fastify.conf.TYPESENSE_HOST,
    fastify.conf.TYPESENSE_PORT
  );

  // Get all listings
  fastify.get(
    '/listings',
    {
      schema: {
        description: 'Get all listings',
        summary: 'List All Properties',
        tags: ['listings'],
        response: {
          200: {
            type: 'object',
            properties: {
              hits: { type: 'array' },
            },
          },
        },
      },
    },
    async (_request, reply: FastifyReply) => {
      const client = typesenseService.getClient();
      const results = await client
        .collections(NostrListing.INDEX_NAME)
        .documents()
        .search({
          q: '*',
          facet_by: '*',
        });
      reply.send(results);
    }
  );

  // Search listings
  fastify.get(
    '/listings/search',
    {
      schema: {
        description: 'Search listings with faceted search',
        summary: 'Search Properties',
        tags: ['listings'],
        response: {
          200: {
            type: 'object',
            properties: {
              hits: { type: 'array' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply: FastifyReply) => {
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
    }
  );

  // Get listing by ID
  fastify.get<{ Params: ListingParams }>(
    '/listings/:listingId',
    {
      schema: {
        description: 'Get a specific listing by ID',
        summary: 'Get Property Details',
        tags: ['listings'],
        params: ListingParamsSchema,
        response: {
          200: Type.Object({
            id: Type.String(),
            // Add other listing properties
          }),
          404: Type.Object({
            error: Type.String(),
          }),
          500: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply: FastifyReply) => {
      try {
        const client = typesenseService.getClient();
        const listing = await client
          .collections(NostrListing.INDEX_NAME)
          .documents(request.params.listingId)
          .retrieve();

        reply.send(listing);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Could not find')
        ) {
          reply.status(404).send({ error: 'Collection or document not found' });
        } else {
          reply.status(500).send({ error: 'An unexpected error occurred' });
        }
      }
    }
  );

  // Get listing from database
  fastify.get<{ Params: ListingParams }>(
    '/listings/db/:listingId',
    {
      schema: {
        description: 'Get listing from database by ID',
        summary: 'Get Property from Database',
        tags: ['listings'],
        params: ListingParamsSchema,
      },
    },
    async (request, reply: FastifyReply) => {
      const listing = await fastify.db.NostrListing.findOneBy({
        eventId: request.params.listingId,
      });

      if (!listing) {
        reply.callNotFound();
        return;
      }

      reply.send(listing);
    }
  );

  // Get listing image
  fastify.get<{ Params: ListingParams }>(
    '/listings/:listingId/image/:imageId',
    {
      schema: {
        description: 'Get listing image',
        summary: 'Get Property Image',
        tags: ['listings'],
        params: ListingParamsSchema,
      },
    },
    async (request, reply: FastifyReply) => {
      const listing = await fastify.db.NostrListing.findOneBy({
        eventId: request.params.listingId,
      });

      if (!listing || !listing.images[request.params.imageId]) {
        reply.callNotFound();
        return;
      }

      const image = await resizeForWeb(listing.images[request.params.imageId]);
      reply.header('Content-Type', 'image/webp');
      reply.send(image);
    }
  );

  // Get nearby listings
  fastify.get<{ Params: ListingParams }>(
    '/listings/get_nearby/:listingId',
    {
      schema: {
        description: 'Find listings near a specific listing',
        summary: 'Find Nearby Properties',
        tags: ['listings'],
        params: ListingParamsSchema,
      },
    },
    async (request, reply: FastifyReply) => {
      const listing = await fastify.db.NostrListing.findOneBy({
        eventId: request.params.listingId,
      });

      if (!listing) {
        reply.callNotFound();
        return;
      }

      const coord: Point = listing.location;
      const client = typesenseService.getClient();

      const results = await client
        .collections(NostrListing.INDEX_NAME)
        .documents()
        .search({
          hidden_hits: listing.eventId,
          q: '*',
          filter_by: `location.coordinates: (${coord.coordinates[0]}, ${coord.coordinates[1]}, 15 km)`,
          sort_by: `location.coordinates(${coord.coordinates[0]}, ${coord.coordinates[1]}):asc`,
        });

      if (results.hits.length === 0) {
        reply.status(404).send({ error: 'No listings found' });
        return;
      }

      reply.send(results);
    }
  );

  // Geosearch
  fastify.get<{ Querystring: GeoSearchQuery }>(
    '/listings/geosearch',
    {
      schema: {
        description: 'Search listings by geographic location',
        summary: 'Search Properties by Location',
        tags: ['listings'],
        querystring: GeoSearchQuerySchema,
        response: {
          200: Type.Object({
            hits: Type.Array(Type.Object({})),
          }),
          404: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply: FastifyReply) => {
      const client = typesenseService.getClient();
      const { lat, lon, dist = '5.1' } = request.query;

      const results = await client
        .collections(NostrListing.INDEX_NAME)
        .documents()
        .search({
          q: '*',
          facet_by: '*',
          filter_by: `location: (${lat}, ${lon}, ${dist} km)`,
          sort_by: `location(${lat}, ${lon}):asc`,
        });

      if (results.hits.length === 0) {
        reply.status(404).send({ error: 'No listings found' });
        return;
      }

      reply.send(results);
    }
  );

  // Get all listing URLs
  fastify.get(
    '/listings/urls',
    {
      schema: {
        description: 'Get all listing URLs',
        summary: 'Get All Property URLs',
        tags: ['listings'],
        response: {
          200: Type.Array(Type.String()),
          500: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (_request, reply: FastifyReply) => {
      try {
        const listings = await fastify.db.NostrListing.find();
        const urls = listings.map(
          (listing) => `/properties/${listing.eventId}`
        );
        reply.send(urls);
      } catch (error) {
        fastify.log.error('Error fetching listing URLs:', error);
        reply.status(500).send({ error: 'Error fetching listing URLs' });
      }
    }
  );

  // Get latest event for a listing
  fastify.get<{ Params: ListingParams }>(
    '/listings/latest-event/:eventId',
    {
      schema: {
        description: 'Get latest event for a listing',
        summary: 'Get Latest Property Event',
        tags: ['listings'],
        params: ListingParamsSchema,
        response: {
          200: Type.Object({
            eventId: Type.String(),
            createdAt: Type.String(),
          }),
          404: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply: FastifyReply) => {
      const listing = await fastify.db.NostrListing.findOneBy({
        eventId: request.params.eventId,
      });

      if (!listing) {
        reply.status(404).send({ error: 'Listing not found' });
        return;
      }

      reply.send({
        eventId: listing.eventId,
        createdAt: new Date(listing.created_at * 1000).toISOString(),
      });
    }
  );
}
