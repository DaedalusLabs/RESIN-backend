import 'reflect-metadata';
import 'websocket-polyfill';

import fastify from 'fastify';
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

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverLogger = mainLogger.child({ module: 'server' });

const server = fastify({
  loggerInstance: serverLogger,
});

// Register plugins
server.register(cors, {
  origin: true, // Customize as needed
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
});

server.register(swagger, {
  openapi: {
    info: {
      title: 'Resin API',
      description: 'Resin API',
      version: '0.0.1',
    },
    consumes: ['application/json'],
    produces: ['application/json'],
  },
  exposeRoute: true,
});

server.register(swaggerUi, {
  routePrefix: '/',
});

server.register(TypeOrmFastifyPlugin);
server.register(fastifyStatic, {
  root: path.join(__dirname, '/../static'),
});

const start = async () => {
  await server.register(fastifyEnv, {
    schema: configSchema,
    confKey: 'conf',
    dotenv: true,
    data: process.env,
  });

  server.register(listingRoutes);
  try {
    await server.listen({ host: '0.0.0.0', port: server.conf.PORT });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
