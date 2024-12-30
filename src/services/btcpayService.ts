export class BTCPayService {
  protected storeId!: string;
  protected baseUrl!: string;
  protected apiKey!: string;

  constructor(baseUrl: string, storeId: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.storeId = storeId;
    this.apiKey = apiKey;
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

  private async request(endpoint: string, method: string, body?: object) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `token ${this.apiKey}`,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}
