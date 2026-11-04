import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return undefined;
}

function typeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type?: unknown }).type;
    if (typeof type === 'string') {
      return type;
    }
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  // Express only treats a middleware as an error handler when it has four params.
  void _next;

  // Validation failures are the caller's fault, so return the first useful
  // message instead of a stack trace.
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join('.');
    res.status(400).json({
      error: issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'invalid input',
    });
    return;
  }

  const type = typeOf(error);
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'payload too large' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid JSON' });
    return;
  }

  const status = statusOf(error);
  if (status === 400) {
    res.status(400).json({ error: 'bad request' });
    return;
  }
  if (status === 413) {
    res.status(413).json({ error: 'payload too large' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'internal error' });
};
