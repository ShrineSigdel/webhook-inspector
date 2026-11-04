import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { endpointsRouter, meEndpointsRouter } from './routes/endpoints';
import { hooksRouter } from './routes/hooks';

export const app = express();

// Behind Nginx, so req.ip and rate limits must read X-Forwarded-For.
app.set('trust proxy', 1);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// The hook route needs the untouched body, so it must come before express.json().
app.use('/hook', hooksRouter);

app.use('/api', express.json(), cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/endpoints', endpointsRouter);
app.use('/api/me', meEndpointsRouter);

app.use(errorHandler);
