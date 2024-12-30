import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { NostrListing } from './NostrListing';

@Entity()
export class Image {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 255 })
  url: string;

  @Column('varchar', { length: 255 })
  sha256: string;

  @Column('varchar', { length: 50, nullable: true })
  blurhash: string;

  @Column('int', { nullable: true })
  width: string;

  @Column('int', { nullable: true })
  height: string;

  @ManyToOne(() => NostrListing, (l) => l.images)
  listing: NostrListing;
}
