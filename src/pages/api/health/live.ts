import type { APIRoute } from 'astro';
import { logEvent } from '../../../utils/logger';

export const GET: APIRoute = () => {
  const uptime = process.uptime();
  logEvent('INFO', 'health.liveness', { status: 'ok', uptimeSeconds: uptime });

  return Response.json({
    status: 'ok',
    uptime,
    timestamp: new Date(),
  });
};