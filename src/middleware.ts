import { defineMiddleware } from 'astro:middleware';

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
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'ERROR' : 'INFO',
        route: url.pathname,
        method: request.method,
        statusCode,
        latencyMs: Math.round(performance.now() - startedAt),
      }),
    );
  }
});
