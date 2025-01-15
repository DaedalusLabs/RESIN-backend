import { FastifyInstance, FastifyReply } from 'fastify';
import { BTCPayService } from '../services/btcpayService.js';
import { Payment } from '../entities/Payment.js';
import { AppDataSource } from '../config/db.js';
import { Type } from '@sinclair/typebox';

// Types
interface FilteredPaymentMethod {
  destination: string;
  paymentLink: string;
  rate: number;
  amount: number;
  due: number;
  currency: string;
}

interface FilteredPaymentMethods {
  [key: string]: FilteredPaymentMethod;
}

interface CreatePaymentBody {
  amount: string;
  currency: string;
  method: 'bitcoin' | 'usdt';
  userPubkey: string;
}

interface PaymentParams {
  invoiceId: string;
}

interface BTCPayMethod {
  paymentMethodId: string;
  destination: string;
  paymentLink: string;
  rate: number;
  amount: string;
  due: string;
  currency: string;
}

// Validation Schemas
const CreatePaymentSchema = {
  body: Type.Object({
    amount: Type.String(),
    currency: Type.String(),
    method: Type.Union([Type.Literal('bitcoin'), Type.Literal('usdt')]),
    userPubkey: Type.String(),
  }),
  response: {
    200: Type.Object({
      id: Type.String(),
      paymentId: Type.String(),
      status: Type.String(),
    }),
    400: Type.Object({
      error: Type.String(),
    }),
    500: Type.Object({
      error: Type.String(),
    }),
  },
};

const PaymentMethodsSchema = {
  response: {
    200: Type.Array(
      Type.Object({
        paymentMethodId: Type.String(),
        destination: Type.String(),
        paymentLink: Type.String(),
        rate: Type.Number(),
        amount: Type.String(),
        due: Type.String(),
        currency: Type.String(),
      })
    ),
  },
};

const PaymentDetailsSchema = {
  response: {
    200: Type.Object({
      invoice: Type.String(),
      expirationTime: Type.String(),
      amount: Type.String(),
      currency: Type.String(),
      status: Type.String(),
      paymentMethods: Type.Record(
        Type.String(),
        Type.Object({
          destination: Type.String(),
          paymentLink: Type.String(),
          rate: Type.Number(),
          amount: Type.Number(),
          due: Type.Number(),
          currency: Type.String(),
        })
      ),
    }),
    500: Type.Object({
      error: Type.String(),
    }),
  },
};

export async function paymentRoutes(fastify: FastifyInstance) {
  const btcpayService = new BTCPayService();
  const paymentRepository = AppDataSource.getRepository(Payment);

  // Get available payment methods
  fastify.get(
    '/payment/methods',
    {
      schema: {
        description: 'Get available payment methods',
        summary: 'List Available Payment Methods',
        tags: ['payments'],
        ...PaymentMethodsSchema,
      },
    },
    async (_request, reply: FastifyReply) => {
      const paymentMethods = await btcpayService.getPaymentMethods();
      reply.send(paymentMethods);
    }
  );

  // Create new payment
  fastify.post<{ Body: CreatePaymentBody }>(
    '/payment/create',
    {
      schema: {
        description: 'Create a new payment',
        summary: 'Create Payment',
        tags: ['payments'],
        ...CreatePaymentSchema,
      },
    },
    async (request, reply: FastifyReply) => {
      const { amount, currency, method, userPubkey } = request.body;

      const paymentMethods =
        method === 'bitcoin'
          ? ['BTC-CHAIN', 'BTC-LN', 'LBTC-CHAIN']
          : method === 'usdt'
            ? ['USDT-CHAIN']
            : null;

      if (!paymentMethods) {
        return reply.code(400).send({ error: 'Invalid payment method' });
      }

      if (currency !== 'USD') {
        return reply.code(400).send({ error: 'Invalid currency' });
      }

      if (parseFloat(amount) <= 0) {
        return reply.code(400).send({ error: 'Invalid amount' });
      }

      try {
        const invoice = await btcpayService.createInvoice(
          amount,
          currency,
          'test',
          paymentMethods
        );

        const payment = new Payment();
        payment.btcpayInvoiceId = invoice.id;
        payment.status = invoice.status;
        payment.userPubkey = userPubkey;
        payment.amount = parseFloat(amount);
        payment.currency = currency;

        await paymentRepository.save(payment);

        reply.send({
          ...invoice,
          paymentId: payment.id,
        });
      } catch (error) {
        console.error(
          'Error creating invoice:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        reply.code(500).send({ error: 'Error creating invoice' });
      }
    }
  );

  // Get invoice status
  fastify.get<{ Params: PaymentParams }>(
    '/payment/invoice/:invoiceId',
    {
      schema: {
        description: 'Get invoice status',
        summary: 'Get Invoice Status',
        tags: ['payments'],
        params: Type.Object({
          invoiceId: Type.String(),
        }),
        response: {
          200: Type.Object({
            id: Type.String(),
            status: Type.String(),
          }),
          500: Type.Object({
            error: Type.String(),
          }),
        },
      },
    },
    async (request, reply: FastifyReply) => {
      try {
        const invoice = await btcpayService.getInvoice(
          request.params.invoiceId
        );

        const payment = await paymentRepository.findOne({
          where: { btcpayInvoiceId: request.params.invoiceId },
        });

        if (payment) {
          payment.status = invoice.status;
          if (invoice.status === 'Settled') {
            const paymentMethods = await btcpayService.getInvoicePaymentMethods(
              request.params.invoiceId
            );
            if (paymentMethods.length > 0) {
              payment.paymentMethod = paymentMethods[0].paymentMethodId;
            }
          }
          await paymentRepository.save(payment);
        }

        reply.send(invoice);
      } catch (error) {
        console.error(
          'Error getting invoice:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        reply.code(500).send({ error: 'Error getting invoice' });
      }
    }
  );

  // Get payment details
  fastify.get<{ Params: PaymentParams }>(
    '/payment/details/:invoiceId',
    {
      schema: {
        description: 'Get detailed payment information',
        summary: 'Get Payment Details',
        tags: ['payments'],
        params: Type.Object({
          invoiceId: Type.String(),
        }),
        ...PaymentDetailsSchema,
      },
    },
    async (request, reply: FastifyReply) => {
      try {
        const invoice = !request.params.invoiceId
          ? await btcpayService.createInvoice('1.00', 'USD', 'test', [
              'BTC-CHAIN',
              'BTC-LN',
              'USDT-CHAIN',
              'LBTC-CHAIN',
            ])
          : await btcpayService.getInvoice(request.params.invoiceId);

        const paymentMethods = await btcpayService.getInvoicePaymentMethods(
          invoice.id
        );
        const filteredPaymentMethods = paymentMethods.reduce(
          (obj: FilteredPaymentMethods, method: BTCPayMethod) => {
            obj[method.paymentMethodId] = {
              destination: method.destination,
              paymentLink: method.paymentLink,
              rate: method.rate,
              amount: Number(method.amount),
              due: Number(method.due),
              currency: method.currency,
            };
            return obj;
          },
          {} as FilteredPaymentMethods
        );

        reply.send({
          invoice: invoice.id,
          expirationTime: invoice.expirationTime,
          amount: invoice.amount,
          currency: invoice.currency,
          status: invoice.status,
          paymentMethods: filteredPaymentMethods,
        });
      } catch (error) {
        console.error(
          'Error getting invoice payment details:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        reply
          .code(500)
          .send({ error: 'Error getting invoice payment details' });
      }
    }
  );
}
