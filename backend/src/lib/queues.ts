import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config';

// BullMQ workers block on Redis commands, so ioredis must keep retrying
// instead of failing the command while the worker waits for work.
export const queueConnection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const CAPTURE_QUEUE = 'capture';
export const MAINTENANCE_QUEUE = 'maintenance';

// Versioned so a deploy with a different schema can reject jobs produced by
// an older process instead of guessing what the fields mean.
export interface CaptureJob {
  v: 1;
  endpointId: string;
  method: string;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: string;
  contentType: string | null;
  ip: string | null;
  sizeBytes: number;
}

export const capture = new Queue<CaptureJob>(CAPTURE_QUEUE, {
  connection: queueConnection,
});

export const maintenance = new Queue(MAINTENANCE_QUEUE, {
  connection: queueConnection,
});

// Retry with exponential backoff (1s, 2s, 4s, ...) so a short database
// outage is survived. History in Redis is bounded to keep memory in check.
export const CAPTURE_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;
