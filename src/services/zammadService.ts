interface TicketArticle {
  subject?: string;
  body: string;
  type: string;
  internal: boolean;
}

interface TicketParams {
  title: string;
  group: string;
  customer: string;
  article: TicketArticle;
  priority_id?: number;
  state_id?: number;
}

export class ZammadService {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(host: string, apiKey: string) {
    this.baseUrl = `${host}/api/v1`;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    };
  }

  async createTicket(params: TicketParams): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/tickets`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  }
}
