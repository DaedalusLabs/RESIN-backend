import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
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
import slugify from 'slugify';
import { config } from 'dotenv';
import { getBasename } from '../util.js';

config();

interface ListingTags {
  security_system?: boolean;
  swimming_pool?: boolean;
  home_office?: boolean;
  solar_panels?: boolean;
  parking?: boolean;
  has_jacuzzi?: boolean;
  has_coworking?: boolean;
  has_gym?: boolean;
  has_garden?: boolean;
  has_security?: boolean;
  district?: string;
  size?: string;
  bedrooms?: string;
  cooling?: boolean;
  garden?: boolean;
  heating?: boolean;
  floors?: string;
  t?: string[];
  completion_date?: string;
  [key: string]: unknown;
}

@Entity()
@Unique(['d'])
export class NostrListing {
  public static INDEX_NAME = 'nostr_listing';

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 64, nullable: true })
  eventId!: string;

  @Column('varchar', { length: 64 })
  d!: string;

  @Column('varchar', { length: 66 })
  pubkey!: string;

  @Column('integer')
  kind!: number;

  @Column('jsonb')
  content!: string;

  @Column('timestamp with time zone')
  created_at!: Date;

  @Column('numeric', { precision: 20, scale: 8, nullable: true })
  amount!: number | null;

  @Column('varchar', { length: 10, nullable: true })
  currency!: string | null;

  @Column('varchar', { length: 255, nullable: true })
  title!: string | null;

  @Column('varchar', { length: 100, nullable: true })
  frequency!: string | null;

  @Column('varchar', { length: 100, nullable: true })
  street!: string;

  @Column('varchar', { length: 100, nullable: true })
  city!: string;

  @Column('varchar', { length: 100, nullable: true })
  country!: string;

  @Column('varchar', { length: 100, nullable: true })
  resinType!: string;

  @Column('varchar', { length: 200, nullable: true })
  attribution!: string;

  @Index({ spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location!: Point | null;

  @Column('jsonb', { nullable: true })
  tags!: ListingTags;

  @OneToMany(() => Image, (image) => image.listing, {
    cascade: true,
    eager: true,
  })
  images!: Image[];

  @ManyToOne(() => Property, (property) => property.listings)
  property!: Property;

  @OneToMany('NostrEventHistory', 'listing', {
    cascade: true,
  })
  eventHistory!: NostrEventHistory[];

  static fromNostrEvent(event: NostrEvent): NostrListing {
    const listing = new NostrListing();
    listing.eventId = event.id ?? '';
    listing.pubkey = event.pubkey;
    listing.kind = event.kind || 0;
    listing.content = event.content;
    listing.created_at = new Date((event.created_at || 0) * 1000);
    listing.tags = {};

    // Process tags
    const tagMap = new Map<string, string[]>();
    listing.images = [];

    for (const tag of event.tags || []) {
      const [tagName, ...tagValues] = tag;

      if (tagName === 'd') {
        listing.d = tagValues[0] ?? '';
      }

      if (tagName === 'image') {
        const image = new Image();
        image.url = tagValues[0] ?? '';
        image.sha256 = getBasename(tagValues[0] ?? '');
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
        const coord = geohash.decode(tagValues[0] ?? '');
        listing.location = {
          type: 'Point',
          coordinates: [coord.longitude, coord.latitude],
        };
      } else if (tag[0] === 'title') {
        listing.title = tag[1] ?? null;
      }

      if (tagName === 'resin-type') {
        listing.resinType = tag[1] ?? '';
      }

      if (tagName === 'street') {
        listing.street = tag[1] ?? '';
      }

      if (tagName === 'city') {
        listing.city = tag[1] ?? '';
      }

      if (tagName === 'country') {
        listing.country = tag[1] ?? '';
      }

      if (tagName === 'attribution') {
        listing.attribution = tag[1] ?? '';
      }
    }

    listing.tags = Object.fromEntries(tagMap) as ListingTags;

    return listing;
  }

  asNostrEvent(): NostrEvent {
    const e: NostrEvent = {
      id: this.eventId,
      pubkey: this.pubkey,
      created_at: this.created_at.getTime() / 1000,
      kind: this.kind,
      content: this.content,
      tags: Object.entries(this.tags).map(([k, v]) => [k, ...(Array.isArray(v) ? v : [String(v)])]),
      sig: '',
    };

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

    return slugify(parts, {
      lower: true,
      strict: true,
      trim: true,
      locale: 'en',
    });
  }
}
