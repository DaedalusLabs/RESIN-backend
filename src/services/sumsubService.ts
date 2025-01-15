import { config } from 'dotenv';
import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import mainLogger from './logger';

const logger = mainLogger.child({ module: 'sumsub' });

config();

export class SumsubService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.SUMSUB_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for signing
    this.client.interceptors.request.use((config) => {
      const ts = Math.floor(Date.now() / 1000);
      const signature = this.generateSignature(
        config.method?.toUpperCase() || 'GET',
        config.url || '',
        ts,
        config.data
      );
      config.headers['X-App-Token'] = process.env.SUMSUB_APP_TOKEN;
      config.headers['X-App-Access-Ts'] = ts.toString();
      config.headers['X-App-Access-Sig'] = signature;
      return config;
    });
  }

  private generateSignature(
    method: string,
    path: string,
    ts: number,
    body?: unknown
  ): string {
    const message = `${ts}${method}${path}${JSON.stringify(body)}`;
    const hmac = crypto.createHmac(
      'sha256',
      process.env.SUMSUB_SECRET_KEY as string
    );
    const signature = hmac.update(message).digest('hex');

    return signature;
  }

  public async generateAccessToken(
    userId: string,
    levelName: string
  ): Promise<string> {
    try {
      const response = await this.client.post('/resources/accessTokens/sdk', {
        userId: encodeURIComponent(userId),
        levelName: encodeURIComponent(levelName),
        ttlInSecs: 600, // Token valid for 10 minutes
      });

      return response.data.token;
    } catch (error) {
      logger.error('Failed to generate access token', error.message);
    }
  }
}
