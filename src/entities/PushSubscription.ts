import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class PushSubscription {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 500 })
  endpoint!: string;

  @Column('jsonb')
  keys!: {
    p256dh: string;
    auth: string;
  };

  @Column({ type: 'varchar', length: 64, nullable: true })
  nostrPubkey?: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label?: string;
}
