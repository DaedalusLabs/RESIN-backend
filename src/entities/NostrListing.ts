import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  AfterInsert,
  AfterUpdate,
  AfterRemove,
  Index,
  Point,
  OneToMany,
} from 'typeorm';
import { TypesenseService } from '../services/typesenseService';
import geohash from 'ngeohash';
import { NostrEvent } from 'nostr-tools';
import { Image } from './Image';

import { config } from 'dotenv';

config();

@Entity()
export class NostrListing {
  public static INDEX_NAME = 'nostr_listing';

  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  static fromNostrEvent(event: NostrEvent): NostrListing {
    const listing = new NostrListing();
    listing.id = event.id;
    listing.pubkey = event.pubkey;
    listing.kind = event.kind;
    listing.content = event.content;
    listing.created_at = new Date(event.created_at * 1000);
    listing.tags = event.tags.map((tag: string[]) => tag.join(':'));

    // Process tags
    const tagMap = new Map<string, string[]>();
    listing.images = [];

    for (const tag of event.tags) {
      const [tagName, ...tagValues] = tag;

      if (tagName === 'image') {
        listing.images.push({ url: tagValues[0] } as Image);
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

    console.log('keyFeatures', keyFeatures);
    console.log('this.tags', this.tags);

    const baseDoc = {
      id: this.id.toString(),
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
      images: this.images.map(
        (image) => `${process.env.BLOSSOM_SERVER}/${image.sha256}.jpeg`
      ),
    };

    if (this.attribution) baseDoc.attribution = this.attribution;

    await typesenseService.indexDocument(NostrListing.INDEX_NAME, baseDoc);
  }

  @AfterRemove()
  async removeFromTypesense() {
    const typesenseService = new TypesenseService();
    typesenseService.deleteDocument(
      NostrListing.INDEX_NAME,
      this.id.toString()
    );
  }
}
