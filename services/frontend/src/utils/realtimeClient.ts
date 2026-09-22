/* The socket the app holds open while somebody is signed in.

   REST is still where bookings come from. This only carries word that one has
   changed, so the worst a broken socket can do is make a screen late — never
   wrong. That shapes everything here: the connection is allowed to fail, and
   every recovery ends in a re-read rather than in guesswork about what was
   missed while it was down.

   The token travels in the handshake's subprotocol rather than the query
   string, because a URL is written to every access log it passes through and
   an access token in a log file is a live credential. */

import { BASE_URL } from './apiClient';

/** Where the line is. Screens show the middle two and ignore the rest. */
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'offline';

export interface RealtimeMessage {
  type: string;
  [key: string]: unknown;
}

type Listener = (message: RealtimeMessage) => void;

/** `http://host/api` -> `ws://host/ws/bookings/`. */
export function socketUrl(base: string = BASE_URL): string {
  const url = new URL(base, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/api\/?$/, '')}/ws/bookings/`.replace(/\/{2,}/g, '/');
  url.search = '';
  return url.toString();
}

/* Backoff: quick enough that a dropped wifi connection feels instant to
   recover from, slow enough that a server that is down is not hammered by
   every open tab. */
const FIRST_RETRY = 1000;
const MAX_RETRY = 30000;
/** Silence longer than this means the line is dead even if the browser has
    not noticed — an idle proxy can hold a socket open for minutes. */
const PING_EVERY = 25000;
const PONG_WITHIN = 10000;
/** The consumer's own code for "your token is no longer good". */
const UNAUTHENTICATED = 4401;

export class RealtimeConnection {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private token: string | null = null;
  private wanted = false;
  private state: RealtimeStatus = 'idle';
  /** Told when a gap in the events is possible, so the caller can re-read. */
  private onResync: (() => void) | null = null;
  /** Set the moment anything could have been missed, and cleared only once
      somebody has re-read. Counting retries is not enough: an expired token
      closes the socket with 4401 and the next open comes from a fresh
      `connect`, which resets the attempt count and would otherwise look
      exactly like a first connection with nothing behind it. */
  private gap = false;

  get status(): RealtimeStatus {
    return this.state;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called after every reconnection, and after a wake from sleep. */
  onGap(handler: (() => void) | null): void {
    this.onResync = handler;
  }

  /** Opens, or re-opens against a new token. Safe to call repeatedly. */
  connect(token: string): void {
    if (this.wanted && this.token === token && this.socket) return;
    this.token = token;
    this.wanted = true;
    this.attempts = 0;
    this.open();
  }

  /** Closes for good — signing out, or losing the session. */
  disconnect(): void {
    this.wanted = false;
    this.token = null;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    // 1000 is a normal close: the server discards the subscription rather
    // than treating it as a drop.
    socket?.close(1000, 'signed out');
    this.setStatus('idle');
  }

  /** Nudges a socket that may have died while the tab was in the background. */
  check(): void {
    if (!this.wanted) return;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.ping();
      return;
    }
    if (this.socket?.readyState !== WebSocket.CONNECTING) this.open();
  }

  private setStatus(status: RealtimeStatus): void {
    this.state = status;
  }

  private open(): void {
    if (!this.wanted || !this.token) return;
    this.clearTimers();

    // A refreshed token opens a new socket; the old one has to go, and its
    // close must not be mistaken for a drop worth retrying.
    const previous = this.socket;
    this.socket = null;
    if (previous) {
      previous.onopen = null;
      previous.onmessage = null;
      previous.onerror = null;
      previous.onclose = null;
      previous.close(1000, 'replaced');
    }

    this.setStatus(this.attempts === 0 ? 'connecting' : this.state);

    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl(), ['bearer', this.token]);
    } catch {
      // A malformed URL or a blocked scheme: retrying cannot help much, but
      // the backoff keeps it from spinning.
      this.retry();
      return;
    }
    this.socket = socket;
    /** Whether this particular socket ever carried anything. */
    let opened = false;

    socket.onopen = () => {
      opened = true;
      this.setStatus('open');
      this.heartbeat();
      this.attempts = 0;
      // Anything that happened while this was down was never delivered, so
      // the list on screen is re-read rather than patched.
      if (this.gap) {
        this.gap = false;
        this.onResync?.();
      }
    };

    socket.onmessage = (event) => {
      let message: RealtimeMessage;
      try {
        message = JSON.parse(String(event.data)) as RealtimeMessage;
      } catch {
        return;
      }
      if (message.type === 'pong') {
        this.clearPong();
        return;
      }
      for (const listener of this.listeners) listener(message);
    };

    socket.onerror = () => {
      // `onclose` always follows, and that is where the retry lives.
    };

    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      this.clearTimers();
      if (!this.wanted) return;
      // A socket that was carrying events and is not any more has left a hole
      // of unknown size, whatever happens next.
      if (opened) this.gap = true;
      if (event.code === UNAUTHENTICATED) {
        // The token has expired. The next REST call refreshes it and the
        // session hands the new one back through `connect`; retrying this
        // one on a loop would only be refused again.
        this.setStatus('offline');
        return;
      }
      this.retry();
    };
  }

  private retry(): void {
    if (!this.wanted) return;
    // Even a first connection that had to be retried leaves a hole: the list
    // was read at sign-in and the socket was not yet carrying anything.
    this.gap = true;
    this.setStatus('offline');
    const wait = Math.min(FIRST_RETRY * 2 ** this.attempts, MAX_RETRY);
    this.attempts += 1;
    // Spread reconnections out: every tab in the building coming back at the
    // same instant is how a recovering server goes down again.
    const jittered = wait * (0.7 + Math.random() * 0.6);
    this.retryTimer = setTimeout(() => this.open(), jittered);
  }

  private heartbeat(): void {
    this.pingTimer = setInterval(() => this.ping(), PING_EVERY);
  }

  private ping(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify({ type: 'ping' }));
    } catch {
      return;
    }
    this.clearPong();
    this.pongTimer = setTimeout(() => {
      // No answer: the socket is open as far as the browser knows and dead as
      // far as anything else is concerned. Close it and let the retry run.
      this.socket?.close(4000, 'no pong');
    }, PONG_WITHIN);
  }

  private clearPong(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.clearPong();
  }
}

/** One connection for the whole app: every screen listens to the same socket. */
export const realtime = new RealtimeConnection();
