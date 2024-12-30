import { Type } from '@sinclair/typebox';

export const configSchema = Type.Object({
  PORT: Type.Number({ default: 3000 }),
  DB_DATABASE: Type.String({ default: 'resin' }),
  DB_USERNAME: Type.String({ default: 'resin' }),
  DB_PASSWORD: Type.String({ default: 'development' }),
  TYPESENSE_HOST: Type.String(),
  TYPESENSE_PORT: Type.Number(),
  TYPESENSE_API_KEY: Type.String(),
  NOSTR_RELAY1: Type.String({ default: 'nostr2.daedaluslabs.io' }),
  NOSTR_RELAY2: Type.String({ default: 'nostr3.daedaluslabs.io' }),
  BTCPAYSERVER_ENDPOINT: Type.String(),
  BTCPAYSERVER_API_KEY: Type.String(),
  ZAMMAD_HOST: Type.String(),
  ZAMMAD_API_KEY: Type.String(),
});
