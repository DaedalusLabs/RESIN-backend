import { Entity, ManyToOne, OneToMany } from 'typeorm';
import { NostrListing } from './NostrListing.js';
import { ImageBase } from './ImageBase.js';
import { Thumbnail } from './Thumbnail.js';

interface TypesenseImage {
  id: string;
  url: string;
  sha256: string;
  blurhash: string;
  width: string;
  height: string;
  listing_id: string | undefined;
}

@Entity()
export class Image extends ImageBase {
  @ManyToOne(() => NostrListing, (l) => l.images, { onDelete: 'CASCADE' })
  listing!: NostrListing;

  @OneToMany(
    () => Thumbnail,
    (thumbnail: Thumbnail) => thumbnail.originalImage,
    {
      cascade: true,
      eager: true,
    }
  )
  thumbnails!: Thumbnail[];

  toTypesense(): TypesenseImage {
    return {
      id: this.id.toString(),
      url: this.url,
      sha256: this.sha256,
      blurhash: this.blurhash || '',
      width: this.width,
      height: this.height,
      listing_id: this.listing?.id?.toString(),
    };
  }

  static fromTypesense(data: TypesenseImage): Partial<Image> {
    const image = new Image();
    image.id = parseInt(data.id);
    image.url = data.url;
    image.sha256 = data.sha256;
    image.blurhash = data.blurhash;
    image.width = data.width;
    image.height = data.height;
    return image;
  }
}
