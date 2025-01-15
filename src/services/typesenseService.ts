import Typesense from 'typesense';
import tsSchema from '../../schema.json';

import mainLogger from './logger';

const logger = mainLogger.child({ module: 'typesense' });

export class TypesenseService {
  private client: Typesense.Client;

  constructor() {
    this.client = new Typesense.Client({
      nodes: [
        {
          host: process.env.TYPESENSE_HOST || 'typesense',
          port: process.env.TYPESENSE_PORT || 8108,
          protocol: 'http',
        },
      ],
      apiKey: process.env.TYPESENSE_API_KEY || 'resin_development',
      logLevel: 'info',
    });
  }

  getClient() {
    return this.client;
  }

  async createCollections() {
    this.client.collections().create(tsSchema);
  }

  async deleteCollections() {
    try {
      // Delete if the collection already exists from a previous example run
      await this.client.collections('nostr_listing').delete();
    } catch {
      // do nothing
    }
  }

  async indexDocument(collectionName: string, document: unknown) {
    try {
      await this.client
        .collections(collectionName)
        .documents()
        .upsert(document);
    } catch (error) {
      logger.error('Error indexing document:', error);
    }
  }

  async deleteDocument(collectionName: string, documentId: string) {
    try {
      await this.client
        .collections(collectionName)
        .documents(documentId)
        .delete();
    } catch (error) {
      logger.error('Error deleting document:', error);
    }
  }
}
