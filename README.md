# RESIN backend server

The backend for the RESIN real estate platform.
Written in TypeScript (5.6).

## Table of Contents

- [Overview](#resin-backend-server)
- [Why this design](#why-this-design)
  - [Integration](#integration)
  - [Out-of-scope](#out-of-scope)
- [Core Components](#core-components)
  - [Fastify](#fastify)
  - [PostgreSQL](#postgresql)
  - [TypeSense](#typesense)
  - [BTCPayServer](#btcpayserver)
- [Project Structure](#project-structure)
  - [Entities](#entities)
  - [Fastify Plugins](#fastify-plugins)
  - [API Routes](#api-routes)
    - [Listing Routes](#listing-routes-listings)
    - [User Routes](#user-routes-nostr-protocol)
    - [Payment Routes](#payment-routes-payment)
    - [Push Notification Routes](#push-notification-routes-nostr-protocol)
    - [Verification Routes](#verification-routes-verify)
- [Key Integrations](#key-integrations)
  - [TypeSense Integration](#typesense-integration)
    - [Direct TypeSense Access](#direct-typesense-access)
  - [Nostr Protocol](#nostr-protocol)
    - [NIP-99 Integration](#nostr-nip-99-integration)
    - [API Protocol](#nostr-api-protocol)
  - [Blossom Integration](#blossom-integration)
  - [Zammad Integration](#zammad-integration)
    - [How the Integration Works](#how-the-integration-works)
- [Technical Concepts](#technical-concepts)
  - [Location Encoding](#location-encoding)
  - [Image Processing](#image-processing-1)
- [Development](#development)
  - [Key Packages](#key-packages)
  - [Commands](#commands)

Powered by:

- Fastify v5, TypeORM running on node.js v20
- PostgresSQL 17
- TypeSense 27.1
- BTCPayServer 2.0

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

## Core Components

### Fastify

[Fastify](https://github.com/fastify/fastify) is a fast and low overhead web framework for Node.js, extensible with plugins.

### PostgreSQL

[PostgreSQL](https://www.postgresql.org/) is a scalable, mature relational database.

### TypeSense

[TypeSense](https://github.com/typesense/typesense) is a lightning-fast open source search engine, which is highly performant and has many convienient features that can be integrated to offer an optimal search and filtering engines, including geo-search.

### BTCPayServer

[BTCPayServer](https://github.com/btcpayserver/btcpayserver) is a self-hostable, open-source bitcoin payment processor.

## Project Structure

### Entities

The project uses TypeORM entities to model the data structure:

- `NostrListing`: Core entity for real estate listings, includes property details, location data, and pricing. Integrates with Typesense for search functionality.
- `Property`: Represents a real estate property with ownership information and relationships to listings, agreements, and transactions.
- `Agreement`: Tracks property agreements and contracts.
- `Transaction`: Records property-related transactions.
- `Image` & `Thumbnail`: Handles property images with support for blurhash previews.
- `NostrUser`: Manages user data with Nostr public key integration.
- `PushSubscription`: Handles web push notifications subscriptions.
- `NostrEventHistory`: Tracks the history of Nostr events.

### Fastify Plugins

The application uses several Fastify plugins for enhanced functionality:

- `@fastify/cors`: Handles Cross-Origin Resource Sharing
- `@fastify/env`: Environment configuration management
- `@fastify/static`: Serves static files
- `@fastify/swagger` & `@fastify/swagger-ui`: OpenAPI documentation and interactive API playground

### API Routes

The application exposes several RESTful API endpoints:

#### Listing Routes (`/listings`)

- `GET /listings`: Get all listings
- `GET /listings/search`: Search listings with faceted search
- `GET /listings/:listingId`: Get a specific listing by ID
- `GET /listings/db/:listingId`: Get listing from database by ID
- `GET /listings/:listingId/image/:imageId`: Get listing image
- `GET /listings/get_nearby/:listingId`: Find listings near a specific listing
- `GET /listings/geosearch`: Search listings by geographic location
- `GET /listings/urls`: Get all listing URLs
- `GET /listings/latest-event/:eventId`: Get latest event for a listing

#### User Routes (Nostr Protocol)

The traditional REST user routes are disabled as they have been replaced by a Nostr-based protocol implementation. User-related operations are now handled through encrypted Nostr events, providing better privacy and decentralization. See the Nostr API section below for details.

#### Payment Routes (`/payment`)

- Payment processing
- BTCPayServer integration
- Transaction status tracking

#### Push Notification Routes (Nostr Protocol)

The traditional push notification routes are disabled in favor of a more privacy-focused approach using Nostr. Instead of relying on centralized push services (like Firebase), the frontend implements a service worker that:

- Connects directly to Nostr relays
- Subscribes to relevant event kinds using filters
- Processes notifications client-side
- Maintains user privacy by avoiding third-party services

This approach provides several benefits:

- Complete privacy: No push notification server required
- Decentralized: Works with any Nostr relay
- Real-time: Instant notification delivery
- Offline support: Service worker handles background processing
- Battery efficient: Uses WebSocket connections

Example service worker implementation:

```typescript
// Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

const ndk = new NDK({
  explicitRelayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
});

// Subscribe to relevant events
const filter = {
  kinds: [30402], // Listing events
  '#p': [userPubkey], // Events tagged with user's pubkey
  since: Math.floor(Date.now() / 1000), // Only new events
};

ndk.subscribe(filter, { closeOnEose: false });
ndk.on('event', (event) => {
  self.registration.showNotification('New Property Update', {
    body: event.content,
    icon: '/icon.png',
    data: { eventId: event.id },
  });
});
```

#### Verification Routes (`/verify`)

- User verification endpoints
- Document verification status

## Key Integrations

### TypeSense Integration

While the backend provides listing endpoints, it's recommended to use TypeSense directly from the frontend for optimal performance. The frontend uses an InstantSearch adapter for TypeSense, which provides:

- Real-time search results
- Faceted filtering
- Geospatial search
- Better performance through direct TypeSense connection

### Direct TypeSense Access

Instead of using the `/listings` endpoints, the frontend should connect directly to TypeSense using a read-only API key. This is safe because:

1. TypeSense documents are representations of public Nostr events
2. No sensitive data is stored in TypeSense
3. Frontend API keys are limited to read-only access
4. The backend uses a separate API key with write access for indexing new events

Example TypeSense configuration for frontend:

```typescript
const typesenseClient = new TypesenseClient({
  nodes: [
    {
      host: 'your-typesense-host',
      port: 443,
      protocol: 'https',
    },
  ],
  apiKey: 'read-only-search-key',
  connectionTimeoutSeconds: 2,
});

const searchClient = new TypesenseInstantSearchAdapter({
  client: typesenseClient,
  configuration: {
    searches: [
      {
        collection: 'listings',
        params: {
          q: '*',
          query_by: 'title,description,location',
          sort_by: '_text_match:desc,created_at:desc',
        },
      },
    ],
  },
});
```

This approach provides:

- Better performance through direct TypeSense queries
- Real-time updates through InstantSearch
- Reduced backend load
- Simplified frontend implementation

The backend still maintains the TypeSense index by:

1. Monitoring Nostr relays for new listing events
2. Validating and processing new listings
3. Updating the TypeSense index with write-access API key
4. Maintaining data consistency between PostgreSQL and TypeSense

### Nostr Protocol

The application implements a custom Nostr-based API protocol for user-related operations. This provides several advantages:

- End-to-end encryption of sensitive data
- Decentralized communication
- Native integration with Nostr clients

#### NIP-99 Integration

The platform uses [NIP-99](https://github.com/nostr-protocol/nips/blob/master/99.md) (Classified Listings) for property listings. This NIP defines how real estate listings should be structured as Nostr events:

- Event Kind: 30402 (Real Estate Listing)
- Required Tags:
  - `d`: Unique identifier
  - `title`: Property title
  - `price`: Amount, currency, and frequency
  - `g`: Geohash location
  - `image`: Property images
  - `t`: Property type

The `NostrListing` entity provides bidirectional conversion between Nostr events and database records:

```typescript
// Converting Nostr event to database entity
const event = {
  kind: 30402,
  content: 'Beautiful downtown apartment...',
  tags: [
    ['d', 'unique-id'],
    ['title', 'Downtown Apartment'],
    ['price', '2500', 'USD', 'monthly'],
    ['g', 'u4pruydqqvj8'],
    ['image', 'https://blossom.example/image1.webp'],
    ['t', 'apartment'],
  ],
};
const listing = NostrListing.fromNostrEvent(event);

// Converting back to Nostr event
const nostrEvent = listing.asNostrEvent();
```

Features:

- Automatic tag parsing and mapping
- Geolocation handling
- Image management
- Property metadata extraction
- TypeSense indexing integration
- Event history tracking

#### API Protocol

The protocol uses two specific Nostr event kinds:

- `24194`: Request events
- `24195`: Response events

Available commands:

- `get_transactions`: Fetch user transactions
- `get_agreements`: Fetch user agreements
- `get_properties`: Fetch user properties

The protocol replaces traditional REST endpoints for user data, providing a more secure and decentralized approach to user-related operations.

### Blossom Integration

[Blossom](https://github.com/blossomfinance/blossom) is used as a decentralized asset storage solution for property-related files. It provides:

- Secure file storage
- Content addressing
- Access control
- Image optimization

The platform uses Blossom to:

1. Store property images
2. Generate optimized thumbnails
3. Create blurhash previews
4. Link assets to Nostr publishers

Example flow:

```typescript
// Image processing and storage
const image = await Image.fromUpload(file);
image.generateThumbnails();
image.computeBlurhash();
await blossom.store(image);

// Image retrieval in listings
const listing = {
  images: [
    {
      url: `${BLOSSOM_SERVER}/${image.sha256}.webp`,
      blurhash: image.blurhash,
      thumbnails: image.thumbnails.map((t) => ({
        url: `${BLOSSOM_SERVER}/${t.sha256}.webp`,
        width: t.width,
        height: t.height,
      })),
    },
  ],
};
```

Benefits:

- Decentralized storage
- Automatic image optimization
- Content-addressed assets
- Publisher-based access control
- Efficient delivery through CDN

The combination of NIP-99 and Blossom ensures that:

1. Property listings follow a standardized format
2. Assets are stored securely and efficiently
3. Content is verifiably linked to publishers
4. Images are optimized for web delivery
5. The system remains decentralized

### Zammad Integration

The application includes a Nostr-to-Zammad bridge for customer support operations. [Zammad](https://zammad.org) is an open-source help desk/customer support system that helps teams manage customer communications efficiently. As operations scale up, integrating encrypted Nostr messages with a professional ticketing system becomes essential.

#### How the Integration Works

The `zammad-nostr.ts` script provides a bidirectional bridge between Nostr's encrypted DMs and Zammad's ticketing system:

1. **Message Reception**:

   - Listens for encrypted direct messages (kind 1059 - gift wrap)
   - Decrypts messages using the service's private key
   - Retrieves sender's Nostr profile information

2. **User Management**:

   - Creates Zammad user if sender doesn't exist
   - Maps Nostr pubkey to Zammad user account
   - Imports user's profile picture if available
   - Updates existing user information if needed

3. **Ticket Handling**:

   - Creates new ticket if user has no open tickets
   - Adds message to existing ticket if one is open
   - Preserves message threading and context
   - Links Nostr event IDs with Zammad references

4. **Response Management**:
   - Monitors Zammad for agent responses
   - Encrypts responses using user's public key
   - Sends encrypted replies back through Nostr
   - Maintains conversation continuity

Example flow:

```
User (Nostr) → Encrypted DM → Bridge → Zammad Ticket
                                   ↓
User (Nostr) ← Encrypted DM ← Bridge ← Agent Response
```

Benefits:

- Privacy-preserving customer support
- Professional ticket management
- Team collaboration on support cases
- Message history preservation
- Seamless user experience

The bridge ensures that:

1. All customer communications remain end-to-end encrypted
2. Support staff can use professional tools
3. Conversations are properly tracked and managed
4. Users can communicate through their preferred Nostr client
5. Support quality can scale with business growth

## Technical Concepts

### Location Encoding

The platform uses two complementary location encoding systems:

#### Geohash

[Geohash](https://en.wikipedia.org/wiki/Geohash) is a hierarchical spatial data structure that subdivides space into buckets of grid shape. Properties:

- Used in NIP-99 for location encoding (`g` tag)
- Provides ~2.4m accuracy with 8 characters
- Enables efficient geospatial queries
- Supported natively by TypeSense

Example:

```typescript
// Encoding
const geohash = encode(latitude, longitude); // "u4pruyd"

// Decoding
const { latitude, longitude } = decode('u4pruyd');

// Finding nearby locations
const neighbors = getNeighbors('u4pruyd');
```

#### Plus Codes

[Plus Codes](https://maps.google.com/pluscodes/) (Open Location Code) is Google's open-source location encoding system:

- Used by some partner integrations
- Human-readable format
- Works without internet
- Global coverage including remote areas

Example:

```typescript
// Standard Plus Code
'8FVC9G8F+5W'; // City level

// With local context
'9G8F+5W Amsterdam, Netherlands'; // Shorter code with city
```

Converting between systems:

```typescript
// Partner data with Plus Code
const plusCode = '8FVC9G8F+5W';
const coords = OpenLocationCode.decode(plusCode);

// Store as Geohash for NIP-99
const geohash = encode(coords.latitude, coords.longitude);
```

### Image Processing

#### Blurhash

[Blurhash](https://blurha.sh/) is a compact representation of a placeholder for an image:

- Generates tiny placeholders (~20-30 bytes)
- Shows image essence while loading
- Improves perceived performance
- Used in property listing previews

Example:

```typescript
// Encoding an image to blurhash
const blurhash = encode(imageData, width, height, 4, 3);

// Decoding to show placeholder
const imageData = decode(blurhash, width, height);
```

Benefits:

1. Instant content display
2. Reduced layout shift
3. Better user experience
4. Minimal bandwidth usage

The platform automatically:

1. Generates blurhash on image upload
2. Stores it with the listing
3. Sends it to TypeSense
4. Uses it for instant previews

## Development

### Key Packages

### Commands

Development:

- `pnpm start`: Start the production server
- `pnpm dev`: Start development server with hot reload
- `pnpm lint`: Run ESLint to check code
- `pnpm format`: Format code using Prettier
- `pnpm lintfix`: Automatically fix ESLint issues

Data Management:

- `pnpm run import <path-to-json-file>`: Import listings from a JSON file
- `pnpm reindex`: Reindex the Typesense collections
- `pnpm load-fixtures`: Load test data into the database
- `pnpm update-images`: Update and process images in the database (requires NOSTR_PRIVKEY and BLOSSOM_SERVER env vars)
- `pnpm migrate-event-history`: Migrate historical Nostr events

Nostr Integration:

- `pnpm publish`: Publish all listings to Nostr relays (requires NOSTR_PRIVKEY env var)
- `pnpm unpublish`: Remove all listings from Nostr relays (requires NOSTR_PRIVKEY env var)
- `pnpm nostr-test`: Test Nostr messaging functionality (requires NOSTR_PRIVKEY env var)

Image Processing:

- `pnpm resize-images <path-to-json-file>`: Resize and optimize images from a JSON file
- `pnpm upload`: Upload media files to Blossom server

Support System:

- `pnpm zammad-nostr`: Run the Zammad-Nostr bridge for customer support integration
