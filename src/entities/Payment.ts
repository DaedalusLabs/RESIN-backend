import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  btcpayInvoiceId!: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment:
      'Payment status from BTCPay (New, Processing, Settled, Expired, Invalid)',
  })
  status!: string;

  @Column({
    type: 'varchar',
    length: 64,
    comment: 'Nostr public key of the user',
  })
  userPubkey!: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Payment amount in the specified currency',
  })
  amount!: number;

  @Column({
    type: 'varchar',
    length: 3,
    comment: 'Three-letter currency code (e.g., USD)',
  })
  currency!: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Payment method used (e.g., BTC-CHAIN, BTC-LN, USDT-CHAIN)',
  })
  paymentMethod?: string;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    comment: 'Timestamp when the payment record was created',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    comment: 'Timestamp when the payment record was last updated',
  })
  updatedAt!: Date;
}
