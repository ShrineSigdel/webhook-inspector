import type { ErrorRequestHandler } from 'express';

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  return undefined;
}

// Minimal for Day 1. Day 2 expands this into the central error handler.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  // Express only treats a middleware as an error handler when it has four params.
  void _next;

  const status = statusOf(error);

  if (status === 413) {
    res.status(413).json({ error: 'payload too large' });
    return;
  }

  if (status === 400) {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'internal error' });
};
