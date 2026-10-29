import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CloudhopApp } from '@cloudhop/core';
import { createApi } from './api';
import script from './assets/app.js';
import page from './assets/index.html';

export interface UiServerOptions {
  app: CloudhopApp;
  /** 0 picks a free port. */
  port?: number;
}

export interface UiServer {
  /** Open this in the browser: it carries the one-time access token. */
  url: string;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024;

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type });
  res.end(body);
}

const sendJson = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('Request too large.');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const sameSecret = (given: string | undefined, expected: string) =>
  given !== undefined &&
  given.length === expected.length &&
  timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/**
 * Serves the local web UI on 127.0.0.1 only. Other sites cannot drive it:
 * the API needs a random per-run token sent in a custom header, and requests
 * with a foreign Host (DNS rebinding) or Origin are rejected.
 */
export async function startUiServer({ app, port = 0 }: UiServerOptions): Promise<UiServer> {
  const token = randomBytes(24).toString('base64url');
  const handle = createApi(app);
  let allowedHosts = new Set<string>();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (!allowedHosts.has(req.headers.host ?? '')) {
        sendJson(res, 403, { error: 'Unexpected host.' });
        return;
      }
      const origin = req.headers.origin;
      if (origin && !allowedHosts.has(origin.replace(/^http:\/\//, ''))) {
        sendJson(res, 403, { error: 'Unexpected origin.' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, 'text/html; charset=utf-8', page);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/app.js') {
        send(res, 200, 'text/javascript; charset=utf-8', script);
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }

      const given = req.headers['x-cloudhop-token'];
      if (!sameSecret(typeof given === 'string' ? given : undefined, token)) {
        sendJson(res, 401, { error: 'Open the link printed by `cloudhop ui`.' });
        return;
      }
      // Actions like remove, sign in or sync carry no body; anything that does must be JSON.
      const hasBody =
        Number(req.headers['content-length'] ?? 0) > 0 ||
        req.headers['transfer-encoding'] !== undefined;
      if (hasBody && !req.headers['content-type']?.startsWith('application/json')) {
        sendJson(res, 415, { error: 'Send JSON.' });
        return;
      }
      const body = hasBody ? await readJson(req) : {};
      const result = await handle({ method: req.method ?? 'GET', path: url.pathname, body });
      sendJson(res, result.status, result.body);
    } catch (error) {
      sendJson(res, 400, { error: (error as Error).message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actualPort = (server.address() as AddressInfo).port;
  allowedHosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);

  return {
    // The token travels in the fragment, so it never reaches server logs or Referer headers.
    url: `http://127.0.0.1:${actualPort}/#token=${token}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
