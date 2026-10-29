import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const CALLBACK_PATH = '/oauth/callback';
const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>cloudhop</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:90vh;margin:0">
<div style="text-align:center"><h1>${title}</h1><p>${body}</p></div></body>`;

export interface LoopbackServer {
  redirectUri: string;
  /** Resolves with the authorization code once the browser comes back. */
  waitForCode(expectedState: string, timeoutMs: number): Promise<string>;
  close(): void;
}

/** Local HTTP server that receives the OAuth redirect on 127.0.0.1 (RFC 8252). */
export async function startLoopbackServer(): Promise<LoopbackServer> {
  let resolveRequest: (url: URL) => void = () => {};
  const request = new Promise<URL>((resolve) => {
    resolveRequest = resolve;
  });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const ok = url.searchParams.has('code');
    res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      ok
        ? PAGE('You are logged in ✔', 'You can close this tab and go back to your terminal.')
        : PAGE('Login failed', 'Go back to your terminal for details.'),
    );
    resolveRequest(url);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    async waitForCode(expectedState, timeoutMs) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out waiting for the browser login.')),
          timeoutMs,
        );
      });
      try {
        const url = await Promise.race([request, timeout]);
        const error = url.searchParams.get('error');
        if (error)
          throw new Error(
            `Login was rejected: ${url.searchParams.get('error_description') ?? error}`,
          );
        if (url.searchParams.get('state') !== expectedState)
          throw new Error('Login state mismatch.');
        const code = url.searchParams.get('code');
        if (!code) throw new Error('The browser did not return an authorization code.');
        return code;
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => server.close(),
  };
}
