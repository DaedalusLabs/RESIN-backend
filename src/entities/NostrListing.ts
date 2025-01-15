import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterUpdate,
  Index,
  Point,
  OneToMany,
  Unique,
  BeforeRemove,
  ManyToOne,
} from 'typeorm';
import { TypesenseService } from '../services/typesenseService.js';
import geohash from 'ngeohash';
import { NostrEvent } from '@nostr-dev-kit/ndk';
import { Image } from './Image.js';
import { Property } from './Property.js';
import { NostrEventHistory } from './NostrEventHistory.js';
import { AppDataSource } from '../config/db.js';
import slugify from 'slugify';

import { config } from 'dotenv';
import { getBasename } from '../util.js';

config();

@Entity()
@Unique(['d'])
export class NostrListing {
  public static INDEX_NAME = 'nostr_listing';

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 64, nullable: true })
  eventId: string;

  @Column('varchar', { length: 64 })
  d: string;

  @Column('varchar', { length: 66 })
  pubkey: string;

  @Column('integer')
  kind: number;

  @Column('jsonb')
  content: object;

  @Column('timestamp with time zone')
  created_at: Date;

  @Column('numeric', { precision: 20, scale: 8, nullable: true })
  amount: number | null;

  @Column('varchar', { length: 10, nullable: true })
  currency: string | null;

  @Column('varchar', { length: 255, nullable: true })
  title: string | null;

  @Column('varchar', { length: 100, nullable: true })
  frequency: string | null;

  @Column('varchar', { length: 100, nullable: true })
  street: string;

  @Column('varchar', { length: 100, nullable: true })
  city: string;

  @Column('varchar', { length: 100, nullable: true })
  country: string;

  @Column('varchar', { length: 100, nullable: true })
  resinType: string;

  @Column('varchar', { length: 200, nullable: true })
  attribution: string;

  @Index({ spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: Point | null;

  @Column('jsonb', { nullable: true })
  tags: object;

  @OneToMany(() => Image, (image) => image.listing, {
    cascade: true,
    eager: true,
  })
  images: Image[];

  @ManyToOne(() => Property, (property) => property.listings)
  property: Property;

  @OneToMany('NostrEventHistory', 'listing', {
    cascade: true,
  })
  eventHistory!: NostrEventHistory[];

  static fromNostrEvent(event: NostrEvent): NostrListing {
    const listing = new NostrListing();
    listing.eventId = event.id;
    listing.pubkey = event.pubkey;
    listing.kind = event.kind || 0;
    listing.content = event.content;
    listing.created_at = new Date((event.created_at || 0) * 1000);
    listing.tags = event.tags?.map((tag: string[]) => tag.join(':')) || [];

    // Process tags
    const tagMap = new Map<string, string[]>();
    listing.images = [];

    for (const tag of event.tags || []) {
      const [tagName, ...tagValues] = tag;

      if (tagName === 'd') {
        listing.d = tagValues[0];
      }

      if (tagName === 'image') {
        const image = { url: tagValues[0] } as Image;
        image.sha256 = getBasename(tagValues[0]);
        listing.images.push(image);
      } else {
        if (!tagMap.has(tagName)) {
          tagMap.set(tagName, []);
        }
        tagMap.get(tagName)!.push(...tagValues);
      }

      if (tagName === 'price') {
        const [amount, currency, frequency] = tagValues;
        listing.amount = parseFloat(amount);
        listing.currency = currency;
        listing.frequency = frequency || null;
      } else if (tagName === 'g') {
        const coord = geohash.decode(tagValues[0]);
        listing.location = {
          type: 'Point',
          coordinates: [coord.longitude, coord.latitude],
        };
      } else if (tag[0] === 'title') {
        listing.title = tag[1];
      }

      if (tagName === 'resin-type') {
        listing.resinType = tag[1];
      }

      if (tagName === 'street') {
        listing.street = tag[1];
      }

      if (tagName === 'city') {
        listing.city = tag[1];
      }

      if (tagName === 'country') {
        listing.country = tag[1];
      }

      if (tagName === 'attribution') {
        listing.attribution = tag[1];
      }
    }

    listing.tags = Object.fromEntries(tagMap);

    return listing;
  }

  getGeohash(): string | null {
    if (this.location) {
      const [lon, lat] = this.location.coordinates;
      return geohash.encode(lat, lon);
    }
    return null;
  }

  @AfterInsert()
  @AfterUpdate()
  async updateTypesense() {
    const typesenseService = new TypesenseService();

    const keyFeatures = [];

    // Add features if they exist and are true
    if (this.tags.security_system) keyFeatures.push('Security system');
    if (this.tags.swimming_pool) keyFeatures.push('Swimming pool');
    if (this.tags.home_office) keyFeatures.push('Home office space');
    if (this.tags.solar_panels) keyFeatures.push('Solar panels');
    if (this.tags.parking) keyFeatures.push('Parking');
    if (this.tags.has_jacuzzi) keyFeatures.push('Jacuzzi');
    if (this.tags.has_coworking) keyFeatures.push('Coworking space');
    if (this.tags.has_gym) keyFeatures.push('Gym');
    if (this.tags.has_garden) keyFeatures.push('Garden');
    if (this.tags.has_security) keyFeatures.push('Security');

    const baseDoc = {
      id: this.eventId.toString(),
      kind: this.kind,
      slug: this.slug,
      title: this.title,
      description: this.content,
      location: {
        street: this.street,
        city: this.city,
        country: this.country,
        coordinates: this.location?.coordinates,
        district: String(this.tags.district),
      },
      property: {
        size: Math.round(Number(this.tags.size)),
        bedrooms: Number(this.tags.bedrooms),
      },
      additional_details: {
        cooling: Boolean(this.tags.cooling),
        has_garden: Boolean(this.tags.garden),
        heating: Boolean(this.tags.heating),
        number_of_floors: Number(this.tags.floors),
        parking: Boolean(this.tags.parking),
        type: String(this.tags.t?.[1]),
        year_built: this.tags.completion_date
          ? new Date(this.tags.completion_date).getFullYear()
          : null,
      },
      key_features: keyFeatures,
      'resin-type': this.resinType,
      price: Number(this.amount),
      images: this.images.map((image) => {
        let thumbnails = [];
        if (image.thumbnails) {
          thumbnails = image.thumbnails.map((thumbnail) => {
            return {
              url: `${process.env.BLOSSOM_SERVER}/${thumbnail.sha256}.webp`,
              width: thumbnail.width,
              height: thumbnail.height,
            };
          });
        }

        return {
          blurhash: image.blurhash,
          files: [
            ...thumbnails,
            {
              url: `${process.env.BLOSSOM_SERVER}/${image.sha256}.webp`,
              width: image.width,
              height: image.height,
            },
          ],
        };
      }),
    };

    if (this.attribution) baseDoc.attribution = this.attribution;

    if (this.images.length > 0 && this.images[0].blurhash) {
      baseDoc.blurhash = this.images[0].blurhash;
    }

    await typesenseService.indexDocument(NostrListing.INDEX_NAME, baseDoc);
  }

  asNostrEvent(): NostrEvent {
    const e = {
      id: this.eventId,
      pubkey: this.pubkey,
      created_at: this.created_at.getTime() / 1000,
      kind: this.kind,
      content: this.content,
      tags: Object.entries(this.tags).map(([k, v]) => [k, ...v]),
    };

    e.tags = e.tags.map((tag: string[]) => {
      if (typeof tag[1] === 'boolean') {
        tag[1] = String(tag[1]);
      }
      return tag;
    });

    e.tags = [
      ...e.tags,
      ...this.images.map((image) => [
        'image',
        `${process.env.BLOSSOM_SERVER}/${image.sha256}.webp`,
        `${image.width}x${image.height}`,
      ]),
    ];

    return e;
  }

  @BeforeRemove()
  async removeFromTypesense() {
    try {
      const typesenseService = new TypesenseService();
      typesenseService.deleteDocument(
        NostrListing.INDEX_NAME,
        this.id.toString()
      );
    } catch (error) {
      console.error('Error removing from Typesense:', error);
    }
  }

  get slug(): string {
    const parts = [this.title, this.city, this.country]
      .filter(Boolean)
      .join(' ');

    return slugify.default(parts, {
      lower: true, // Convert to lowercase
      strict: true, // Strip special characters
      trim: true, // Trim leading and trailing spaces
      locale: 'en', // Use English locale
    });
  }

  @AfterInsert()
  @AfterUpdate()
  async addToEventHistory() {
    if (this.eventId) {
      const history = new NostrEventHistory();
      history.eventId = this.eventId;
      history.listing = this;
      await AppDataSource.getRepository(NostrEventHistory).save(history);
    }
  }
}
