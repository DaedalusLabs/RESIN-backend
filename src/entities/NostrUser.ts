import { Entity, PrimaryColumn, Column, OneToMany, ManyToMany } from 'typeorm';
import { Property } from './Property.js';
import { Agreement } from './Agreement.js';
import { Transaction } from './Transaction.js';

@Entity()
export class NostrUser {
  @PrimaryColumn('varchar', { length: 64 })
  pubkey: string;

  @Column('varchar', { length: 64 })
  npub: string;

  @ManyToMany(() => Property, (property) => property.owners)
  ownedProperties: Property[];

  @OneToMany(() => Agreement, (agreement) => agreement.user)
  agreements: Agreement[];

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];
}
