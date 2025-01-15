import { config } from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import mainLogger from './logger';

const logger = mainLogger.child({ module: 'btcpay' });

config();

export class BTCPayService {
  protected storeId!: string;
  protected baseUrl!: string;
  protected apiKey!: string;
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.BTCPAY_BASE_URL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `token ${process.env.BTCPAY_API_KEY}`,
      },
    });

    this.baseUrl = process.env.BTCPAY_BASE_URL;
    this.storeId = process.env.BTCPAY_STORE_ID;
    this.apiKey = process.env.BTCPAY_API_KEY;
  }

  public createPaymentRequest(amount: string, title: string, currency: string) {
    const api_endpoint = `/api/v1/stores/${this.storeId}/payment-requests`;

    const body = { amount, currency, title };
    return this.request(api_endpoint, 'POST', body);
  }

  public getPaymentRequest(paymentRequestId: string) {
    const api_endpoint = `/api/v1/stores/${this.storeId}/payment-requests/${paymentRequestId}`;

    return this.request(api_endpoint, 'GET');
  }

  public createInvoice(
    amount: string,
    currency: string,
    orderId: string,
    paymentMethods: string[]
  ) {
    const api_endpoint = `/api/v1/stores/${this.storeId}/invoices`;

    const body = {
      amount,
      currency,
      metadata: { orderId },
      checkout: { paymentMethods },
    };
    return this.request(api_endpoint, 'POST', body);
  }

  public getInvoice(invoiceId: string) {
    const api_endpoint = `/api/v1/stores/${this.storeId}/invoices/${invoiceId}`;

    return this.request(api_endpoint, 'GET');
  }

  public getInvoicePaymentMethods(invoiceId: string) {
    const api_endpoint = `/api/v1/stores/${this.storeId}/invoices/${invoiceId}/payment-methods`;

    return this.request(api_endpoint, 'GET');
  }

  public getPaymentMethods() {
    const api_endpoint = `/api/v1/stores/${this.storeId}/payment-methods`;

    return this.request(api_endpoint, 'GET');
  }

  private async request(endpoint: string, method: string, body?: object) {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data: body ? JSON.stringify(body) : undefined,
      });

      return response.data;
    } catch (error) {
      logger.error(
        `Error creating request.\r\n${endpoint}\r\n${JSON.stringify(body)}`
      );
      throw error;
    }
  }
}
