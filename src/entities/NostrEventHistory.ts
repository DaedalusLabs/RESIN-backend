import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import type { NostrListing } from './NostrListing.js';

@Entity()
export class NostrEventHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 64 })
  eventId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('NostrListing', 'eventHistory', { onDelete: 'CASCADE' })
  listing!: NostrListing;
}
