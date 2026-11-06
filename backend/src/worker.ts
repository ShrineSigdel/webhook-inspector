import { Worker } from 'bullmq';
import { pool } from './lib/db';
import { cleanup } from './jobs/cleanup';
import { saveRequest } from './jobs/saveRequest';
import {
  CAPTURE_QUEUE,
  MAINTENANCE_QUEUE,
  capture,
  maintenance,
  queueConnection,
  type CaptureJob,
} from './lib/queues';
import { redis } from './lib/redis';

const captureWorker = new Worker<CaptureJob>(
  CAPTURE_QUEUE,
  async (job) => {
    await saveRequest(job.data);
  },
  { connection: queueConnection, concurrency: 10 },
);

// Never log job.data: it contains captured headers that may hold cookies or
// Authorization values the owner should not see in the logs.
captureWorker.on('failed', (job, error) => {
  console.error(`Capture job ${job?.id ?? 'unknown'} failed: ${error.message}`);
});
captureWorker.on('error', (error) => {
  console.error('Capture worker error:', error);
});

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async () => {
    await cleanup();
  },
  { connection: queueConnection },
);

maintenanceWorker.on('failed', (job, error) => {
  console.error(`Maintenance job ${job?.id ?? 'unknown'} failed: ${error.message}`);
});
maintenanceWorker.on('error', (error) => {
  console.error('Maintenance worker error:', error);
});

async function start(): Promise<void> {
  // The v6 scheduler replaces the old `repeat` option. Upserting is
  // idempotent, so restarting the worker does not create duplicates.
  await maintenance.upsertJobScheduler(
    'cleanup',
    { every: 10 * 60 * 1000 },
    { name: 'cleanup' },
  );
  console.log('Worker ready: capture (concurrency 10) and maintenance');
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down worker`);

  try {
    // finish active jobs before touching the shared Redis connection
    await captureWorker.close();
    await maintenanceWorker.close();
    await capture.close();
    await maintenance.close();
    await queueConnection.quit();
    await redis.quit();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Shutdown failed:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
