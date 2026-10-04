/* The 360° try-on video, through the backend.

   The app sends the photo and a hairstyle *id* — never a prompt. The backend
   reads the admin's prompt for that style and the admin's chosen video model,
   and asks the AI service for the video; this module only starts the job,
   asks how it is going, and fetches the finished clip.

   A video takes a minute or two upstream, so it is a job rather than a call:
   `start` answers once the haircut is on the photo and the video is under
   way (20–60 s), `status` is cheap and polled, `content` is the clip. */

import { ApiError } from './apiError';
import { api, requestBlob } from './apiClient';

export type TryOnVideoStatus = 'processing' | 'completed' | 'failed';

interface ApiTryOnVideo {
  id: number;
  status: TryOnVideoStatus;
  hairstyle_id: number | null;
  hairstyle_name: string;
  video_model: string;
  duration_seconds: number | null;
  error: { code: string; message: string } | null;
  created_at: string;
  completed_at: string | null;
  /** Only on the answer to `start`: the edited still the video begins on. */
  poster?: string;
}

export interface TryOnVideoJob {
  id: string;
  status: TryOnVideoStatus;
  hairstyleName: string;
  videoModel: string;
  durationSeconds: number | null;
  error: { code: string; message: string } | null;
}

const toJob = (row: ApiTryOnVideo): TryOnVideoJob => ({
  id: String(row.id),
  status: row.status,
  hairstyleName: row.hairstyle_name,
  videoModel: row.video_model,
  durationSeconds: row.duration_seconds,
  error: row.error,
});

/** A data URL into a Blob, so the poster can go into IndexedDB with the rest. */
const dataUrlToBlob = (url: string): Blob | null => {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(url);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
};

export const tryOnVideoService = {
  /** `POST /api/tryon/videos/` — the photo and the chosen style. Slow: the
      haircut is rendered onto the photo before this answers. */
  async start(photo: Blob, hairstyleId: string): Promise<{ job: TryOnVideoJob; poster: Blob | null }> {
    const form = new FormData();
    form.append('image', photo, 'photo.jpg');
    form.append('hairstyle_id', hairstyleId);
    const row = await api.post<ApiTryOnVideo>('/tryon/videos/', form);
    return { job: toJob(row), poster: row.poster ? dataUrlToBlob(row.poster) : null };
  },

  /** `GET /api/tryon/videos/<id>/` — processing, completed or failed. */
  status: (id: string) => api.get<ApiTryOnVideo>(`/tryon/videos/${encodeURIComponent(id)}/`).then(toJob),

  /** `GET /api/tryon/videos/<id>/content/` — the finished clip. */
  content: (id: string) => requestBlob(`/tryon/videos/${encodeURIComponent(id)}/content/`, {}, 'video'),
};

/** How often to ask while a video renders. The backend asks upstream at most
    every ten seconds whatever this is, so a shorter interval only means the
    app notices sooner. */
export const POLL_INTERVAL_MS = 6000;
/** Past this the wait is abandoned: the provider has stalled, not slowed. */
export const MAX_WAIT_MS = 10 * 60 * 1000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** Poll until the job settles. Resolves on `completed`, throws an `ApiError`
    carrying the job's own code on `failed`, and `timeout` past MAX_WAIT_MS.
    Asks once straight away: a job resumed after a reload may already be done. */
export async function waitForVideo(id: string, signal?: AbortSignal, now: () => number = Date.now): Promise<TryOnVideoJob> {
  const started = now();
  for (;;) {
    const job = await tryOnVideoService.status(id);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      throw new ApiError(job.error?.code ?? 'video_failed', job.error?.message ?? 'The 360° video could not be made.');
    }
    if (now() - started > MAX_WAIT_MS) throw new ApiError('timeout', 'The 360° video took too long.');
    await sleep(POLL_INTERVAL_MS, signal);
  }
}
