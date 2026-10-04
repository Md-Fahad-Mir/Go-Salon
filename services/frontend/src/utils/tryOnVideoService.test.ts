/* The 360° video job client: start, poll until it settles, fetch the clip. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { sent, serve } from '../test/http';
import { ApiError } from './apiError';
import { MAX_WAIT_MS, POLL_INTERVAL_MS, tryOnVideoService, waitForVideo } from './tryOnVideoService';

const job = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 12, status, hairstyle_id: 7, hairstyle_name: 'Admin fade', video_model: 'kwaivgi/kling-v3.0-std',
  duration_seconds: 3, error: null, created_at: '2026-10-04T10:00:00Z', completed_at: null, ...extra,
});

beforeEach(() => {
  useAppStore.getState().setSession({
    user: { id: 'U1', name: 'T', role: 'customer', phone: '+8801955000009', createdAt: '', credits: 3 },
    access: 'a',
    refresh: 'r',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tryOnVideoService.start', () => {
  it('sends the photo and the style id as multipart, and hands back the poster', async () => {
    serve({ status: 201, body: job('processing', { poster: 'data:image/jpeg;base64,/9j/4AAQ' }) });
    const { job: started, poster } = await tryOnVideoService.start(new Blob(['photo'], { type: 'image/jpeg' }), '7');

    expect(sent[0].url).toBe('http://api.test/api/tryon/videos/');
    expect(sent[0].method).toBe('POST');
    // The browser writes the multipart boundary; a JSON content type would break it.
    expect(sent[0].headers['Content-Type']).toBeUndefined();
    expect(started).toMatchObject({ id: '12', status: 'processing', hairstyleName: 'Admin fade' });
    expect(poster?.type).toBe('image/jpeg');
    expect(poster?.size).toBe(6); // '/9j/4AAQ' is six bytes of JPEG header
  });
});

describe('waitForVideo', () => {
  it('polls until the video is done', async () => {
    vi.useFakeTimers();
    serve(
      { status: 200, body: job('processing') },
      { status: 200, body: job('processing') },
      { status: 200, body: job('completed') },
    );
    const done = waitForVideo('12');
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    await expect(done).resolves.toMatchObject({ status: 'completed' });
    expect(sent).toHaveLength(3);
    expect(sent[0].url).toBe('http://api.test/api/tryon/videos/12/');
  });

  it("throws the job's own code when it fails", async () => {
    serve({ status: 200, body: job('failed', { error: { code: 'content_blocked', message: 'No.' } }) });
    const failure = await waitForVideo('12').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('content_blocked');
  });

  it('gives up on a job that has stalled', async () => {
    let clock = 0;
    serve({ status: 200, body: job('processing') });
    const failure = await waitForVideo('12', undefined, () => {
      clock += MAX_WAIT_MS + 1;
      return clock;
    }).catch((error: unknown) => error);
    expect((failure as ApiError).code).toBe('timeout');
  });

  it('stops when the screen is left', async () => {
    vi.useFakeTimers();
    serve({ status: 200, body: job('processing') });
    const controller = new AbortController();
    const waiting = waitForVideo('12', controller.signal).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    expect(((await waiting) as DOMException).name).toBe('AbortError');
    expect(sent).toHaveLength(1);
  });
});

describe('tryOnVideoService.content', () => {
  it('refuses an answer that is not a video', async () => {
    serve({ status: 200, blob: new Blob(['<html>'], { type: 'text/html' }) });
    const failure = await tryOnVideoService.content('12').catch((error: unknown) => error);
    expect((failure as ApiError).code).toBe('not_a_video');
  });
});
