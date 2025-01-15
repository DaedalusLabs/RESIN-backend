import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { NostrUser } from './NostrUser.js';
import { Property } from './Property.js';
import { Payment } from './Payment.js';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column('varchar', { length: 3 })
  currency: string;

  @Column('varchar', { length: 20 })
  status: string;

  @Column('timestamp with time zone')
  dueDate: Date;

  @ManyToOne(() => NostrUser, (user) => user.transactions)
  user: NostrUser;

  @ManyToOne(() => Property, (property) => property.transactions)
  property: Property;

  @OneToOne(() => Payment, { nullable: true })
  @JoinColumn()
  payment: Payment | null;
}
