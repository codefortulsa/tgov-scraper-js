/**
 * Webhook Management for Batch Processing Events
 *
 * Provides APIs to manage webhook subscriptions and handlers for
 * pub/sub event delivery to external systems.
 */
import crypto from "crypto";

import { db } from "./data";
import {
  batchCreated,
  BatchCreatedEvent,
  batchStatusChanged,
  BatchStatusChangedEvent,
  taskCompleted,
  TaskCompletedEvent,
} from "./topics";

import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { Subscription } from "encore.dev/pubsub";

// Webhook signing secret for HMAC verification
const webhookSigningSecret = secret("WebhookSigningSecret");

/**
 * Registers a new webhook subscription
 */
export const registerWebhook = api(
  {
    method: "POST",
    path: "/webhooks/register",
    expose: true,
  },
  async (params: {
    name: string;
    url: string;
    secret?: string;
    eventTypes: string[];
  }): Promise<{
    id: string;
    name: string;
    url: string;
    eventTypes: string[];
    createdAt: Date;
  }> => {
    const { name, url, secret, eventTypes } = params;

    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      throw APIError.invalidArgument("Invalid URL format");
    }

    // Validate event types
    const validEventTypes = [
      "batch-created",
      "task-completed",
      "batch-status-changed",
    ];
    for (const eventType of eventTypes) {
      if (!validEventTypes.includes(eventType)) {
        throw APIError.invalidArgument(`Invalid event type: ${eventType}`);
      }
    }

    try {
      const webhook = await db.webhookSubscription.create({
        data: {
          name,
          url,
          secret,
          eventTypes,
        },
      });

      log.info(`Registered webhook ${webhook.id}`, {
        webhookId: webhook.id,
        name,
        url,
        eventTypes,
      });

      return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        eventTypes: webhook.eventTypes,
        createdAt: webhook.createdAt,
      };
    } catch (error) {
      log.error("Failed to register webhook", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to register webhook");
    }
  },
);

/**
 * Lists all webhook subscriptions
 */
export const listWebhooks = api(
  {
    method: "GET",
    path: "/webhooks",
    expose: true,
  },
  async (params: {
    limit?: number;
    offset?: number;
    activeOnly?: boolean;
  }): Promise<{
    webhooks: Array<{
      id: string;
      name: string;
      url: string;
      eventTypes: string[];
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
  }> => {
    const { limit = 10, offset = 0, activeOnly = true } = params;

    try {
      const where = activeOnly ? { active: true } : {};

      const [webhooks, total] = await Promise.all([
        db.webhookSubscription.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
        }),
        db.webhookSubscription.count({ where }),
      ]);

      return {
        webhooks: webhooks.map((webhook) => ({
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          eventTypes: webhook.eventTypes,
          active: webhook.active,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
        })),
        total,
      };
    } catch (error) {
      log.error("Failed to list webhooks", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to list webhooks");
    }
  },
);

/**
 * Updates a webhook subscription
 */
export const updateWebhook = api(
  {
    method: "PATCH",
    path: "/webhooks/:webhookId",
    expose: true,
  },
  async (params: {
    webhookId: string;
    name?: string;
    url?: string;
    secret?: string;
    eventTypes?: string[];
    active?: boolean;
  }): Promise<{
    id: string;
    name: string;
    url: string;
    eventTypes: string[];
    active: boolean;
    updatedAt: Date;
  }> => {
    const { webhookId, name, url, secret, eventTypes, active } = params;

    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch (error) {
        throw APIError.invalidArgument("Invalid URL format");
      }
    }

    // Validate event types if provided
    if (eventTypes) {
      const validEventTypes = [
        "batch-created",
        "task-completed",
        "batch-status-changed",
      ];
      for (const eventType of eventTypes) {
        if (!validEventTypes.includes(eventType)) {
          throw APIError.invalidArgument(`Invalid event type: ${eventType}`);
        }
      }
    }

    try {
      const webhook = await db.webhookSubscription.update({
        where: { id: webhookId },
        data: {
          ...(name !== undefined && { name }),
          ...(url !== undefined && { url }),
          ...(secret !== undefined && { secret }),
          ...(eventTypes !== undefined && { eventTypes }),
          ...(active !== undefined && { active }),
        },
      });

      log.info(`Updated webhook ${webhookId}`, {
        webhookId,
        name: name || webhook.name,
        url: url || webhook.url,
        eventTypes: eventTypes || webhook.eventTypes,
        active: active !== undefined ? active : webhook.active,
      });

      return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        eventTypes: webhook.eventTypes,
        active: webhook.active,
        updatedAt: webhook.updatedAt,
      };
    } catch (error) {
      log.error(`Failed to update webhook ${webhookId}`, {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to update webhook");
    }
  },
);

/**
 * Deletes a webhook subscription
 */
export const deleteWebhook = api(
  {
    method: "DELETE",
    path: "/webhooks/:webhookId",
    expose: true,
  },
  async (params: {
    webhookId: string;
  }): Promise<{
    success: boolean;
  }> => {
    const { webhookId } = params;

    try {
      await db.webhookSubscription.delete({
        where: { id: webhookId },
      });

      log.info(`Deleted webhook ${webhookId}`, { webhookId });

      return { success: true };
    } catch (error) {
      log.error(`Failed to delete webhook ${webhookId}`, {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to delete webhook");
    }
  },
);

/**
 * Helper function to deliver webhook events
 */
async function deliverWebhookEvent(
  webhook: { id: string; url: string; secret?: string | null },
  eventType: string,
  payload: Record<string, any>,
): Promise<void> {
  const fullPayload = {
    eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  try {
    // Create a new webhook delivery record
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: fullPayload,
        attempts: 1,
      },
    });

    // Generate signature if we have a secret
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Tulsa-Transcribe-Webhook",
      "X-Event-Type": eventType,
      "X-Delivery-ID": delivery.id,
    };

    if (webhook.secret) {
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(JSON.stringify(fullPayload))
        .digest("hex");

      headers["X-Signature"] = signature;
    } else if (webhookSigningSecret()) {
      // If webhook doesn't have a secret but we have a global one, use that
      const signature = crypto
        .createHmac("sha256", webhookSigningSecret())
        .update(JSON.stringify(fullPayload))
        .digest("hex");

      headers["X-Signature"] = signature;
    }

    // Send the webhook
    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(fullPayload),
    });

    // Update the delivery record
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        responseStatus: response.status,
        responseBody: await response.text(),
        successful: response.ok,
        lastAttemptedAt: new Date(),
      },
    });

    if (!response.ok) {
      log.warn(`Webhook delivery failed for ${webhook.id}`, {
        webhookId: webhook.id,
        url: webhook.url,
        eventType,
        status: response.status,
      });
    } else {
      log.debug(`Webhook delivered successfully to ${webhook.url}`, {
        webhookId: webhook.id,
        eventType,
      });
    }
  } catch (error) {
    log.error(`Error delivering webhook for ${webhook.id}`, {
      webhookId: webhook.id,
      url: webhook.url,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });

    // Update the delivery record with the error
    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: fullPayload,
        error: error instanceof Error ? error.message : String(error),
        attempts: 1,
        successful: false,
        lastAttemptedAt: new Date(),
      },
    });
  }
}

/**
 * Retry failed webhook deliveries
 */
export const retryFailedWebhooks = api(
  {
    method: "POST",
    path: "/webhooks/retry",
    expose: true,
  },
  async (params: {
    limit?: number;
    maxAttempts?: number;
  }): Promise<{
    retriedCount: number;
    successCount: number;
  }> => {
    const { limit = 10, maxAttempts = 3 } = params;

    try {
      // Find failed deliveries that haven't exceeded the maximum attempts
      const failedDeliveries = await db.webhookDelivery.findMany({
        where: {
          successful: false,
          attempts: { lt: maxAttempts },
        },
        orderBy: { scheduledFor: "asc" },
        take: limit,
      });

      if (failedDeliveries.length === 0) {
        return { retriedCount: 0, successCount: 0 };
      }

      let successCount = 0;

      // Retry each delivery
      for (const delivery of failedDeliveries) {
        // Get the webhook subscription
        const webhook = await db.webhookSubscription.findUnique({
          where: { id: delivery.webhookId },
        });

        if (!webhook || !webhook.active) {
          continue; // Skip inactive or deleted webhooks
        }

        try {
          // Generate signature if we have a secret
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Tulsa-Transcribe-Webhook",
            "X-Event-Type": delivery.eventType,
            "X-Delivery-ID": delivery.id,
            "X-Retry-Count": delivery.attempts.toString(),
          };

          if (webhook.secret) {
            const signature = crypto
              .createHmac("sha256", webhook.secret)
              .update(JSON.stringify(delivery.payload))
              .digest("hex");

            headers["X-Signature"] = signature;
          } else if (webhookSigningSecret()) {
            const signature = crypto
              .createHmac("sha256", webhookSigningSecret())
              .update(JSON.stringify(delivery.payload))
              .digest("hex");

            headers["X-Signature"] = signature;
          }

          // Send the webhook
          const response = await fetch(webhook.url, {
            method: "POST",
            headers,
            body: JSON.stringify(delivery.payload),
          });

          // Update the delivery record
          await db.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              responseStatus: response.status,
              responseBody: await response.text(),
              successful: response.ok,
              attempts: { increment: 1 },
              lastAttemptedAt: new Date(),
            },
          });

          if (response.ok) {
            successCount++;
          }
        } catch (error) {
          // Update the delivery record with the error
          await db.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              error: error instanceof Error ? error.message : String(error),
              attempts: { increment: 1 },
              successful: false,
              lastAttemptedAt: new Date(),
            },
          });
        }
      }

      return {
        retriedCount: failedDeliveries.length,
        successCount,
      };
    } catch (error) {
      log.error("Failed to retry webhooks", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal("Failed to retry webhooks");
    }
  },
);

/**
 * Retry failed webhooks without parameters - wrapper for cron job
 * // TODO: TEST THIS
 */
export const retryFailedWebhooksCronTarget = api(
  {
    method: "POST",
    path: "/webhooks/retry/cron",
    expose: false,
  },
  async () => {
    // Call with default parameters
    return retryFailedWebhooks({
      limit: 10,
      maxAttempts: 3,
    });
  },
);

/**
 * Subscription to batch created events for webhook delivery
 */
const _ = new Subscription(batchCreated, "webhook-batch-created", {
  handler: async (event: BatchCreatedEvent) => {
    // Find active webhook subscriptions for this event type
    const subscriptions = await db.webhookSubscription.findMany({
      where: {
        active: true,
        eventTypes: {
          has: "batch-created",
        },
      },
    });

    // Deliver the event to each subscription
    for (const subscription of subscriptions) {
      await deliverWebhookEvent(subscription, "batch-created", {
        batchId: event.batchId,
        batchType: event.batchType,
        taskCount: event.taskCount,
        metadata: event.metadata || {},
        timestamp: event.timestamp,
      });
    }
  },
});

/**
 * Subscription to task completed events for webhook delivery
 */
const __ = new Subscription(taskCompleted, "webhook-task-completed", {
  handler: async (event: TaskCompletedEvent) => {
    // Find active webhook subscriptions for this event type
    const subscriptions = await db.webhookSubscription.findMany({
      where: {
        active: true,
        eventTypes: {
          has: "task-completed",
        },
      },
    });

    // Deliver the event to each subscription
    for (const subscription of subscriptions) {
      await deliverWebhookEvent(subscription, "task-completed", {
        batchId: event.batchId,
        taskId: event.taskId,
        taskType: event.taskType,
        success: event.success,
        errorMessage: event.errorMessage,
        resourceIds: event.resourceIds,
        meetingRecordId: event.meetingRecordId,
        timestamp: event.timestamp,
      });
    }
  },
});

/**
 * Subscription to batch status changed events for webhook delivery
 */
const ___ = new Subscription(
  batchStatusChanged,
  "webhook-batch-status-changed",
  {
    handler: async (event: BatchStatusChangedEvent) => {
      // Find active webhook subscriptions for this event type
      const subscriptions = await db.webhookSubscription.findMany({
        where: {
          active: true,
          eventTypes: {
            has: "batch-status-changed",
          },
        },
      });

      // Deliver the event to each subscription
      for (const subscription of subscriptions) {
        await deliverWebhookEvent(subscription, "batch-status-changed", {
          batchId: event.batchId,
          status: event.status,
          taskSummary: event.taskSummary,
          timestamp: event.timestamp,
        });
      }
    },
  },
);

/**
 * Cron job to retry failed webhook deliveries
 */
export const retryWebhooksCron = new CronJob("retry-failed-webhooks", {
  title: "Retry Failed Webhook Deliveries",
  schedule: "*/5 * * * *", // Every 5 minutes
  endpoint: retryFailedWebhooksCronTarget,
});
