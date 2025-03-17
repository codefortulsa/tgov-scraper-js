import { Service } from "encore.dev/service";

/**
 * Batch Processing Service
 *
 * Centralizes all batch operations across the application, including:
 * - Media processing tasks (video downloads, conversions)
 * - Document processing tasks (agenda downloads)
 * - Transcription job management
 *
 * Uses pub/sub for event-driven architecture to notify other services
 * about completed processing tasks.
 */

export default new Service("batch", {
  middlewares: [],
});
