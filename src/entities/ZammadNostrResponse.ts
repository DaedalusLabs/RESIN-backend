import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ZammadNostrResponse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 255 })
  eventId: string;

  @Column('int')
  ticketId: number;

  @Column('int')
  articleId: number;
}
