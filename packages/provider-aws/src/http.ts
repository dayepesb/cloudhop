export type Fetch = typeof fetch;

/** An HTTP error from an AWS endpoint, keeping the OAuth `error` code when there is one. */
export class AwsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'AwsHttpError';
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const code = (body.error ?? body.__type ?? body.code) as string | undefined;
    const description = (body.error_description ?? body.message ?? text) as string;
    throw new AwsHttpError(
      response.status,
      code,
      `${response.status} ${code ?? ''} ${description}`.trim(),
    );
  }
  return body as T;
}

export async function postJson<T>(fetchFn: Fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse<T>(response);
}

export async function getJson<T>(
  fetchFn: Fetch,
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  return parse<T>(await fetchFn(url, { headers }));
}
