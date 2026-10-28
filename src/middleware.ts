import { defineMiddleware } from 'astro:middleware';
import { logEvent } from './utils/logger';

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  const startedAt = performance.now();
  let statusCode = 500;

  try {
    const response = await next();
    statusCode = response.status;
    return response;
  } finally {
    logEvent(statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO', 'api.request', {
      route: url.pathname,
      method: request.method,
      statusCode,
      latencyMs: Math.round(performance.now() - startedAt),
    });
  }
});
