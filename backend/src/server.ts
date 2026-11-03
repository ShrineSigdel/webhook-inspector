import express from 'express';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { endpointsRouter } from './routes/endpoints';
import { hooksRouter } from './routes/hooks';

const app = express();

// Behind Nginx, so req.ip and rate limits must read X-Forwarded-For.
app.set('trust proxy', 1);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// The hook route needs the untouched body, so it must come before express.json().
app.use('/hook', hooksRouter);

app.use('/api', express.json());
app.use('/api/endpoints', endpointsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});
