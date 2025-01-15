import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { NostrUser } from './NostrUser.js';
import { Property } from './Property.js';

@Entity()
export class Agreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('varchar', { length: 64 })
  sha256: string;

  @Column('varchar', { length: 2048 })
  url: string;

  @Column('boolean', { default: false })
  isSigned: boolean;

  @Column('timestamp with time zone', { nullable: true })
  signedDate: Date | null;

  @ManyToOne(() => NostrUser, (user) => user.agreements)
  user: NostrUser;

  @ManyToOne(() => Property, (property) => property.agreements)
  property: Property;
}
