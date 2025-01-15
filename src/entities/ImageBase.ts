import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  TableInheritance,
} from 'typeorm';

@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type' } })
export abstract class ImageBase {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 255 })
  url!: string;

  @Column('varchar', { length: 255 })
  sha256!: string;

  @Column('varchar', { length: 50, nullable: true })
  blurhash!: string;

  @Column('int', { nullable: true })
  width!: string;

  @Column('int', { nullable: true })
  height!: string;
}
