import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../config/config';

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Request logs deliberately omit headers, query string and bodies: only
 * operational metadata (ids, route, status, latency) is emitted so that
 * personal data never reaches the logs.
 */
export function buildLoggerParams(config: AppConfig, stream?: NodeJS.WritableStream): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      ...(stream ? { stream } : {}),
      base: { service: 'tracking-notifier' },
      formatters: { level: (label) => ({ level: label }) },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = headerValue(req, 'x-request-id');
        const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customProps: (req: IncomingMessage) => {
        const tenantId = headerValue(req, 'x-tenant-id');
        return tenantId && SAFE_ID.test(tenantId) ? { tenantId } : {};
      },
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
    },
  };
}
