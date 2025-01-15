import 'reflect-metadata';
import 'websocket-polyfill';

import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import fastifyEnv from '@fastify/env';

import mainLogger from './services/logger';
import { TypeOrmFastifyPlugin } from './plugins/fastifyTypeorm';
import { listingRoutes } from './routes/listingRoutes';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { configSchema } from './plugins/config';
import { config } from 'dotenv';
import { NostrService } from './services/nostrService';
import { verificationRoutes } from './routes/verificationRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';
import { WebPushService } from './services/webPushService.js';
import { AppDataSource } from './config/db.js';
import fs from 'fs';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverLogger = mainLogger.child({ module: 'server' });

declare module 'fastify' {
  interface FastifyInstance {
    conf: {
      PORT: number;
      TYPESENSE_HOST: string;
      TYPESENSE_PORT: number;
    };
  }
}

const server: FastifyInstance = fastify({
  loggerInstance: serverLogger,
  disableRequestLogging: true,
});

// Register plugins
server.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

server.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Resin API',
      description: 'Resin API',
      version: '0.0.1',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  server.register(swaggerUi, {
    routePrefix: '/',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    logo: {
      type: 'image/svg+xml',
      content: fs.readFileSync(
        path.join(__dirname, '/../static/resin-white.svg')
      ),
    },
    theme: {
      title: 'Resin API Documentation',
      backgroundColor: '#303031',
      primaryColor: '#f07e19',
      textColor: '#ffffff',
      favicon: [
        {
          filename: 'favicon.png',
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          content: fs.readFileSync(
            path.join(__dirname, '/../static/favicon-16x16.png')
          ),
        },
        {
          filename: 'favicon-32x32.png',
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          content: fs.readFileSync(
            path.join(__dirname, '/../static/favicon-32x32.png')
          ),
        },
      ],
    },
  });
}

server.register(TypeOrmFastifyPlugin);
server.register(fastifyStatic, {
  root: path.join(__dirname, '/../static'),
});

// Add proxy route for Typesense multi_search
server.all('/multi_search', async (request, reply) => {
  const typesenseUrl = `http://${server.conf.TYPESENSE_HOST}:${server.conf.TYPESENSE_PORT}/multi_search`;
  const apiKey = request.headers['x-typesense-api-key'];
  
  if (!apiKey) {
    return reply.status(400).send({ error: 'X-TYPESENSE-API-KEY header is required' });
  }
  
  try {
    const response = await fetch(typesenseUrl, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'X-TYPESENSE-API-KEY': apiKey as string
      },
      body: request.method !== 'GET' ? JSON.stringify(request.body) : undefined
    });

    const data = await response.json();
    return reply.send(data);
  } catch (error) {
    request.log.error('Error proxying to Typesense:', error);
    return reply.status(500).send({ error: 'Failed to proxy request to Typesense' });
  }
});

let nostrService: NostrService;
let webPushService: WebPushService;

const start = async () => {
  await server.register(fastifyEnv, {
    schema: configSchema,
    confKey: 'conf',
    dotenv: true,
    data: process.env,
  });

  // Initialize services
  webPushService = new WebPushService(AppDataSource);
  server.decorate('webPushService', webPushService);

  server.register(listingRoutes);
  server.register(verificationRoutes);
  server.register(paymentRoutes);

  try {
    await server.listen({ host: '0.0.0.0', port: server.conf.PORT });

    // Initialize and start NostrService after server is running
    nostrService = new NostrService();
    await nostrService.start();
    server.log.info('NostrService started successfully');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
