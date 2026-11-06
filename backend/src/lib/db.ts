import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.databaseUrl });

// Postgres restarting or dropping an idle client emits an 'error' event. An
// EventEmitter without a listener would crash the process, which would defeat
// BullMQ's retries during a short outage.
pool.on('error', (error) => {
  console.error('Unexpected Postgres pool error:', error.message);
});
