# RESIN backend server

The backend for the RESIN real estate platform.
Written in TypeScript (5.6).

Powered by:

- Fastify v5, TypeORM running on node.js v20
- PostgresSQL 17
- TypeSense 27.1
- BTCPayServer 2.0

## Commands

- `yarn run import`: Import data from data.json
- `yarn reindex`: Reindex the Typesense collections

## Why this design

Although RESIN could connect to "just" Nostr, the design of Nostr as protocol would result in a "sluggish" user experience that scares away potential users. Events are not stored on all relays by default, so users might not see any listings when connected to their own relay.
Also it makes content moderation more difficult, at this moment the assumption is that we only want to list our own properties or by verified/whitelisted parties.

### Fastify

A fast and low overhead web framework for Node.js, extensible with plugins.
Fastify allows for rapid development of the back-end, solid integration with logging engines and testing frameworks.
[Fastify version 5](https://github.com/fastify/fastify/releases/tag/v5.0.0) was released in September 2024.

### PostgreSQL

PostgreSQL has proven to be a scalable, mature relational database. In September 2024 [version 17 was released](https://www.postgresql.org/about/news/postgresql-17-released-2936/).
Major versions of PostgreSQL are supportes for 5 years after it's initial release, and after that provides a managable upgrade path to next versions. PostgreSQL will be used to cache listings based on [Nostr NIP-99 events (classified listings, kind 30402)](https://github.com/nostr-protocol/nips/blob/master/99.md) and to store information we need to collect from our users, like usage and payment history.

### TypeSense

Typesense is a lightning-fast open source search engine, which is highly performant and has many convienient features that can be integrated to offer an optimal search and filtering engines, including geo-search.
[Version 27.1 was released in September 2024](https://github.com/typesense/typesense/releases/tag/v27.1)

### BTCPayServer

BTCPay Server is a self-hostable, open-source bitcoin payment processor. It allows us to accept Bitcoin and (Liquid) USDT for any payments we need to receive. It integrates with many backends and wallets and provides excellent integration options.
[Version 2 was released in October 2024](https://blog.btcpayserver.org/btcpay-server-2-0/)

### Integration

The backend server will cache the listings on the RESIN platform, by checking Nostr relays for `kind 30402` listings from whitelisted accounts.

When new listings are published, they will be cached in the PostgreSQL database and indexed by TypeSense for searching, filtering and visualisation on maps.

The frontend communicates with the backend through a REST API that is specified by OpenAPI (with a API Playground based on Swagger UI).

The Nostr account that users use to interact with us stay client side. The API only receives signed events, so the backend can verify authenticity.

When a user needs to use our services, the backend prepares a BTCPayServer payment and forwards the user.
After payment it will be redirected back to the RESIN platform.

Ideally the RESIN frontend utilizes Nostr relays as much as possible, with this backend as support for a more frictionless and user-friendly experience.

### Out-of-scope

The signing of documents will be out of scope for the API, this can be integrated with API's of third party document signing providers.
The same applies to user ID verification.
