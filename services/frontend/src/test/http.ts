/* A fake network, shared by the client and store suites.

   Only `fetch` is faked. Everything above it — the api client, its typed
   errors, the services, the store actions — is the real code. */

import { vi } from 'vitest';

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** Every request that was made, in order. Cleared by `serve`. */
export const sent: Recorded[] = [];

export const lastRequest = (): Recorded | undefined => sent[sent.length - 1];

export type Answer = { status: number; body?: unknown } | 'unreachable';

/** Queue up what the server will say, in order. A call past the end of the
    queue fails loudly rather than reusing the last answer, so a test cannot
    pass because of a request it did not mean to make. */
export function serve(...answers: Answer[]): void {
  sent.length = 0;
  const queue = [...answers];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      });
      const answer = queue.shift();
      if (answer === undefined) throw new Error(`unexpected request: ${String(input)}`);
      if (answer === 'unreachable') throw new TypeError('Failed to fetch');
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.body === undefined ? {} : { 'content-type': 'application/json' },
      });
    }),
  );
}

/** Fails the test if anything reaches the network at all. */
export function serveNothing(): void {
  serve();
}

/** Answer by URL instead of by order.

    `serve` is a queue, which is exactly right when a test knows the order it
    expects and wants an unplanned request to fail loudly. It is the wrong
    shape once several independent things are in flight at once — a screen
    that loads while a fire-and-forget refresh is still running has no fixed
    order, and a queue would make the test flaky rather than strict.

    Matching is by substring of the URL, first match wins. A request nothing
    matches still throws, so the guarantee that matters is kept. */
export function route(table: Array<[match: string, answer: Answer]>): void {
  sent.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({
        url,
        method: init?.method ?? 'GET',
        headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      });
      const hit = table.find(([match]) => url.includes(match));
      if (!hit) throw new Error(`unexpected request: ${url}`);
      const answer = hit[1];
      if (answer === 'unreachable') throw new TypeError('Failed to fetch');
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.body === undefined ? {} : { 'content-type': 'application/json' },
      });
    }),
  );
}

/** Every request made to a URL containing `match`. */
export const requestsTo = (match: string): Recorded[] => sent.filter((r) => r.url.includes(match));
