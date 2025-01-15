import { Entity, Column, ManyToOne } from 'typeorm';
import { ImageBase } from './ImageBase.js';
import { Image } from './Image.js';

@Entity()
export class Thumbnail extends ImageBase {
  @Column('varchar', { length: 20 })
  format!: string; // e.g., 'webp', 'jpeg'

  @Column('varchar', { length: 20 })
  size!: string; // e.g., 'small', 'medium', 'large'

  @ManyToOne(() => Image, (image) => image.thumbnails, { onDelete: 'CASCADE' })
  originalImage!: Image;
}
