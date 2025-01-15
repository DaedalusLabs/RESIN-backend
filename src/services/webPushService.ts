import webpush from 'web-push';
import mainLogger from './logger.js';
import { DataSource, Repository } from 'typeorm';
import { PushSubscription as DbPushSubscription } from '../entities/PushSubscription.js';

const logger = mainLogger.child({ module: 'webPushService' });

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

export class WebPushService {
  private subscriptionRepository: Repository<DbPushSubscription>;

  constructor(private dataSource: DataSource) {
    if (
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    ) {
      throw new Error('VAPID configuration is missing');
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    this.subscriptionRepository =
      this.dataSource.getRepository(DbPushSubscription);
  }

  async saveSubscription(
    subscription: PushSubscription,
    nostrPubkey?: string,
    label?: string
  ): Promise<DbPushSubscription> {
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { endpoint: subscription.endpoint },
    });

    if (existingSubscription) {
      existingSubscription.keys = subscription.keys;
      existingSubscription.active = true;
      if (nostrPubkey) existingSubscription.nostrPubkey = nostrPubkey;
      if (label) existingSubscription.label = label;
      return await this.subscriptionRepository.save(existingSubscription);
    }

    const newSubscription = this.subscriptionRepository.create({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      nostrPubkey,
      label,
      active: true,
    });

    return await this.subscriptionRepository.save(newSubscription);
  }

  async getSubscriptionsByPubkey(
    nostrPubkey: string
  ): Promise<DbPushSubscription[]> {
    return await this.subscriptionRepository.find({
      where: {
        nostrPubkey,
        active: true,
      },
    });
  }

  async sendNotification(subscription: PushSubscription, payload: PushPayload) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      logger.info(
        { subscription: subscription.endpoint },
        'Push notification sent successfully'
      );
    } catch (error) {
      logger.error(
        { error, subscription: subscription.endpoint },
        'Failed to send push notification'
      );

      // If subscription is invalid, mark it as inactive
      if (error instanceof webpush.WebPushError && error.statusCode === 410) {
        await this.deactivateSubscription(subscription.endpoint);
      }

      throw error;
    }
  }

  async broadcastNotification(payload: PushPayload, nostrPubkey?: string) {
    const whereClause = {
      active: true,
      ...(nostrPubkey ? { nostrPubkey } : {}),
    };
    const subscriptions = await this.subscriptionRepository.find({
      where: whereClause,
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendNotification(sub, payload))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info(
      { succeeded, failed, nostrPubkey },
      'Broadcast notification results'
    );

    return { succeeded, failed };
  }

  async deactivateSubscription(endpoint: string) {
    await this.subscriptionRepository.update({ endpoint }, { active: false });
  }

  async deactivateAllPubkeySubscriptions(nostrPubkey: string) {
    await this.subscriptionRepository.update(
      { nostrPubkey },
      { active: false }
    );
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || '';
  }
}
