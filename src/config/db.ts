import { DataSource } from 'typeorm';
import { NostrListing } from '../entities/NostrListing';
import { Image } from '../entities/Image';
import { ZammadNostrResponse } from '../entities/ZammadNostrResponse';

const AppDataSource = new DataSource({
  type: 'postgres', // Or your preferred database
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_DATABASE || 'resin',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'resin',
  password: process.env.DB_PASSWORD || 'development',
  entities: [NostrListing, Image, ZammadNostrResponse],
  synchronize: true, // Be cautious with this in production
});

export { AppDataSource };
