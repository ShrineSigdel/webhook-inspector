import { app } from './app';
import { config } from './lib/config';
import { pool } from './lib/db';
import { capture, maintenance, queueConnection } from './lib/queues';
import { redis } from './lib/redis';
import { closeAllStreams } from './routes/stream';

const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down API`);

  try {
    // SSE responses never end on their own; closing them first lets
    // server.close() finish instead of waiting for every client.
    closeAllStreams();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

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
