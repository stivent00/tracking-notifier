import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

/** What the fake customer endpoint does with the Nth request (0-based). */
export type Behavior = number | 'hang' | Promise<number>;

export class WebhookTarget {
  readonly requests: RecordedRequest[] = [];
  private server: Server | undefined;

  constructor(private behavior: (index: number) => Behavior = () => 200) {}

  setBehavior(behavior: (index: number) => Behavior): void {
    this.behavior = behavior;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        const index = this.requests.length;
        this.requests.push({
          method: req.method ?? '',
          path: req.url ?? '',
          headers: req.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
        });
        const outcome = this.behavior(index);
        if (outcome === 'hang') return;
        res.statusCode = await outcome;
        res.end();
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  url(path = '/hook'): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}${path}`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

export async function waitFor<T>(
  check: () => Promise<T | undefined | false> | T | undefined | false,
  { timeoutMs = 10_000, intervalMs = 25, description = 'condition' } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
