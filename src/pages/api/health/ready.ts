import type { APIRoute } from 'astro';
import { logEvent } from '../../../utils/logger';

export const GET: APIRoute = () => {
  logEvent('INFO', 'health.readiness', { status: 'ready' });

  return Response.json({
    status: 'ready',
    timestamp: new Date(),
  });
};