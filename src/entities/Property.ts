import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { NostrListing } from './NostrListing.js';
import { Agreement } from './Agreement.js';
import { Transaction } from './Transaction.js';
import { NostrUser } from './NostrUser.js';

@Entity()
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  name: string;

  @OneToMany(() => NostrListing, (listing) => listing.property)
  listings: NostrListing[];

  @OneToMany(() => Agreement, (agreement) => agreement.property)
  agreements: Agreement[];

  @OneToMany(() => Transaction, (transaction) => transaction.property)
  transactions: Transaction[];

  @ManyToMany(() => NostrUser, (user) => user.ownedProperties)
  @JoinTable({
    name: 'property_owners',
    joinColumn: { name: 'property_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_pubkey', referencedColumnName: 'pubkey' },
  })
  owners: NostrUser[];

  @Column('jsonb', { nullable: true })
  ownershipPercentages: { [key: string]: number };
}
