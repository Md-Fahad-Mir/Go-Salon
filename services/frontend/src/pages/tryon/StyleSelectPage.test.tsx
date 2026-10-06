/* The 360° try-on, from the style picker to a video on the device.

   The picker offers the admin's catalogue and nothing else, and asks the
   backend for a video by hairstyle *id* — the admin's prompt and the admin's
   video model are attached there, so neither may leave the app. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../../components/LanguageProvider';
import { ThemeProvider } from '../../components/ThemeProvider';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { requestsTo, route } from '../../test/http';
import type { Answer } from '../../test/http';
import { mount } from '../../test/render';
import type { User } from '../../types';
import { photoStore } from '../../utils/storage';
import StyleSelectPage from './StyleSelectPage';
import TryOnHomePage from './TryOnHomePage';

const PHOTO = 'photo:test';

const FADE = {
  id: 7,
  name: 'Admin fade',
  category: 'Haircut',
  prompt: 'A crisp mid fade with a short textured top',
  image: 'data:image/png;base64,iVBORw0KGgo=',
};
const BRAIDS = {
  id: 9,
  name: 'Admin braids',
  category: 'Braiding',
  prompt: 'Medium knotless box braids',
  image: '',
};

/** Names the old hardcoded catalogue shipped. None may appear any more. */
const OLD_MOCK_NAMES = ['Skin fade', 'Layer cut', 'Holud bridal updo', 'Wolf cut', 'Pompadour'];

/** The backend's count — `Apps/tryon/credits.py`. */
const credits = (used: number, total: number | null = 3) => ({
  plan: total === null ? { slug: 'advanced', name: 'Advanced' } : { slug: 'free', name: 'Free' },
  total,
  used,
  remaining: total === null ? null : Math.max(0, total - used),
  unlimited: total === null,
  period_start: '2026-10-01T00:00:00+06:00',
  resets_at: '2026-11-01T00:00:00+06:00',
});

const PLANS = [
  { slug: 'free', name: 'Free', currency: 'BDT', price: '0.00', other_prices: [], monthly_credits: 3,
    features: ['Book appointments'], is_featured: false, is_default: true },
  { slug: 'basic', name: 'Basic', currency: 'BDT', price: '199.00', other_prices: [], monthly_credits: 30,
    features: [], is_featured: false, is_default: false },
  { slug: 'advanced', name: 'Advanced', currency: 'BDT', price: '499.00',
    other_prices: [{ currency: 'USD', amount: '4.99' }], monthly_credits: null, features: [],
    is_featured: true, is_default: false },
];

const STARTED = {
  id: 12,
  status: 'processing',
  hairstyle_id: 7,
  hairstyle_name: 'Admin fade',
  video_model: 'kwaivgi/kling-v3.0-std',
  duration_seconds: 3,
  error: null,
  created_at: '2026-10-04T10:00:00Z',
  completed_at: null,
  poster: 'data:image/jpeg;base64,/9j/4AAQ',
  credits: credits(1),
};
const COMPLETED = {
  ...STARTED, status: 'completed', poster: undefined, credits: undefined, completed_at: '2026-10-04T10:01:30Z',
};
const CLIP: Answer = { status: 200, blob: new Blob(['mp4-bytes'], { type: 'video/mp4' }) };

const someone = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z',
});

const PRISTINE_APP = useAppStore.getState();
const PRISTINE_TRYON = useTryOnStore.getState();

beforeEach(async () => {
  useAppStore.setState(PRISTINE_APP, true);
  useAppStore.getState().setAuthStatus('ready');
  useAppStore.getState().setSession({ user: someone(), access: 'a', refresh: 'r' });
  useTryOnStore.setState(PRISTINE_TRYON, true);
  useTryOnStore.setState({ photoKey: PHOTO });
  await photoStore.put(PHOTO, new Blob(['photo'], { type: 'image/jpeg' }));
});

/** The whole backend, by URL. More specific paths first: first match wins. */
const backend = (
  overrides: { catalogue?: Answer; start?: Answer; status?: Answer; credits?: Answer } = {},
) =>
  route([
    ['/tryon/videos/12/content/', CLIP],
    ['/tryon/videos/12/', overrides.status ?? { status: 200, body: COMPLETED }],
    ['/tryon/videos/', overrides.start ?? { status: 201, body: STARTED }],
    ['/tryon/credits/', overrides.credits ?? { status: 200, body: credits(0) }],
    ['/subscription-tiers/', { status: 200, body: PLANS }],
    ['/hairstyles/catalogue/', overrides.catalogue ?? { status: 200, body: [FADE, BRAIDS] }],
  ]);

const creditReads = () => requestsTo('/tryon/credits/').filter((request) => request.method === 'GET');

const openPicker = () =>
  mount({
    at: '/ai-tryon/select',
    routes: {
      '/ai-tryon/select': <StyleSelectPage />,
      '/ai-tryon/preview/:id': <p>the preview</p>,
    },
  });

/** The multipart body the app sent to start the video. */
const startForm = (): FormData => {
  const call = (fetch as Mock).mock.calls.find(
    ([url, init]) => String(url).endsWith('/tryon/videos/') && (init as RequestInit)?.method === 'POST',
  );
  expect(call, 'no video was started').toBeDefined();
  return (call![1] as RequestInit).body as FormData;
};

describe('style picker', () => {
  it('shows the admin styles — name, category and image — and no hardcoded ones', async () => {
    backend();
    openPicker();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    expect(screen.getByText('Admin braids')).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    expect(screen.getByText('Braiding')).toBeInTheDocument();
    expect(screen.getByAltText('Admin fade hairstyle')).toHaveAttribute('src', FADE.image);
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('offers nothing but the catalogue — no AI picks, no photo analysis', async () => {
    backend();
    openPicker();

    await screen.findByText('Admin fade');
    expect(requestsTo('/analyze')).toHaveLength(0);
    expect(screen.queryByText('AI picks for you')).not.toBeInTheDocument();
  });

  it('asks for the video by style id, waits for it, keeps it and opens it', async () => {
    // What the backend says once this video's credit is taken.
    backend({ credits: { status: 200, body: credits(1) } });
    openPicker();

    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    expect(await screen.findByText('the preview')).toBeInTheDocument();

    const form = startForm();
    expect(form.get('hairstyle_id')).toBe('7');
    expect(form.get('image')).toBeInstanceOf(Blob);
    // The prompt is the backend's to attach, from the admin's catalogue.
    expect(form.has('prompt')).toBe(false);
    expect(form.has('hairstyle_description')).toBe(false);

    const [result] = useAppStore.getState().generations;
    expect(result).toMatchObject({ hairstyleId: '7', hairstyleName: 'Admin fade', model: 'kwaivgi/kling-v3.0-std' });
    expect(result.videoKey).toBeDefined();
    const clip = await photoStore.get(result.videoKey!);
    expect(clip?.type).toBe('video/mp4');
    expect(await photoStore.get(result.resultKey)).toBeDefined();   // the poster
    // The count is the backend's — read on arrival and again after the video —
    // never one the app worked out for itself.
    expect(useAppStore.getState().user?.tryOnCredits).toMatchObject({ used: 1, remaining: 2 });
    await waitFor(() => expect(creditReads().length).toBeGreaterThanOrEqual(2));
    expect(useTryOnStore.getState().pending).toBeNull();
  });

  it('starts a style picked earlier, looked up in the catalogue as it is now', async () => {
    useTryOnStore.setState({ selectedHairstyleId: '9' });
    backend({ start: { status: 201, body: { ...STARTED, hairstyle_id: 9, hairstyle_name: 'Admin braids' } } });
    openPicker();

    expect(await screen.findByText('the preview')).toBeInTheDocument();
    expect(startForm().get('hairstyle_id')).toBe('9');
  });

  it('does not start a style the admin switched off after it was picked', async () => {
    useTryOnStore.setState({ selectedHairstyleId: '3' });
    backend({ catalogue: { status: 200, body: [FADE] } });
    openPicker();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    await waitFor(() => expect(useTryOnStore.getState().selectedHairstyleId).toBeNull());
    expect(requestsTo('/tryon/videos/')).toHaveLength(0);
  });

  it('a video that fails upstream costs nothing and says why', async () => {
    backend({
      status: {
        status: 200,
        body: { ...STARTED, status: 'failed', poster: undefined,
                error: { code: 'content_blocked', message: 'Try a different photo.' } },
      },
    });
    openPicker();

    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    expect(await screen.findByRole('button', { name: /Admin fade/ })).toBeInTheDocument();
    expect(useAppStore.getState().generations).toHaveLength(0);
    // A failed video hands its credit back on the backend; the app asks again.
    await waitFor(() => expect(creditReads().length).toBeGreaterThanOrEqual(2));
    expect(useAppStore.getState().user?.tryOnCredits?.remaining).toBe(3);
    expect(useTryOnStore.getState().pending).toBeNull();
    const [toast] = useAppStore.getState().toasts;
    expect(toast?.message).toBe('That photo could not be used. Try a clearer, well-lit photo of your face.');
  });

  it('a style withdrawn mid-pick is explained, and the list refreshed', async () => {
    backend({
      start: { status: 404, body: { detail: 'That style is no longer available.', code: 'hairstyle_unavailable', errors: {} } },
    });
    openPicker();

    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    await waitFor(() => expect(requestsTo('/hairstyles/catalogue/')).toHaveLength(2));
    expect(useAppStore.getState().toasts[0]?.message).toBe('That style is no longer available. Pick another one.');
  });

  it('picks a video back up after the screen was left mid-render', async () => {
    useTryOnStore.setState({
      pending: {
        generationId: 'GEN-resumed', jobId: '12', hairstyleId: '7', hairstyleName: 'Admin fade',
        sourceKey: PHOTO, posterKey: 'result:GEN-resumed', videoModel: 'kwaivgi/kling-v3.0-std',
      },
    });
    await photoStore.put('result:GEN-resumed', new Blob(['poster'], { type: 'image/jpeg' }));
    backend();
    openPicker();

    expect(await screen.findByText('the preview')).toBeInTheDocument();
    expect(requestsTo('/tryon/videos/').filter((r) => r.method === 'POST')).toHaveLength(0);
    expect(useAppStore.getState().generations[0]?.id).toBe('GEN-resumed');
  });

  it('picks a video back up under StrictMode, which mounts the screen twice', async () => {
    useTryOnStore.setState({
      pending: {
        generationId: 'GEN-strict', jobId: '12', hairstyleId: '7', hairstyleName: 'Admin fade',
        sourceKey: PHOTO, posterKey: 'result:GEN-strict', videoModel: 'kwaivgi/kling-v3.0-std',
      },
    });
    await photoStore.put('result:GEN-strict', new Blob(['poster'], { type: 'image/jpeg' }));
    backend();
    // At the root, as src/main.tsx has it: nested under the router, React does
    // not replay the mount, and the test would prove nothing.
    render(
      <StrictMode>
        <ThemeProvider>
          <LanguageProvider>
            <MemoryRouter initialEntries={['/ai-tryon/select']}>
              <Routes>
                <Route path="/ai-tryon/select" element={<StyleSelectPage />} />
                <Route path="/ai-tryon/preview/:id" element={<p>the preview</p>} />
              </Routes>
            </MemoryRouter>
          </LanguageProvider>
        </ThemeProvider>
      </StrictMode>,
    );

    expect(await screen.findByText('the preview')).toBeInTheDocument();
    expect(useAppStore.getState().generations[0]?.id).toBe('GEN-strict');
  });

  it('shows the plans instead of starting when the month is spent', async () => {
    backend({ credits: { status: 200, body: credits(3) } });
    openPicker();

    expect(await screen.findByText('No credits')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    expect(await screen.findByText('This month’s credits are used up')).toBeInTheDocument();
    expect(await screen.findByText('Your plan')).toBeInTheDocument();
    expect(screen.getByText('Unlimited try-ons')).toBeInTheDocument();
    expect(requestsTo('/tryon/videos/')).toHaveLength(0);
  });

  it('opens the plans when the backend refuses for want of credits', async () => {
    backend({
      start: { status: 403, body: { detail: 'Used up.', code: 'no_credits', errors: {} } },
    });
    openPicker();

    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    expect(await screen.findByText('Plans and credits')).toBeInTheDocument();
    expect(useAppStore.getState().generations).toHaveLength(0);
  });

  it('never stops an unlimited plan', async () => {
    backend({ credits: { status: 200, body: credits(40, null) } });
    openPicker();

    expect(await screen.findByText('Unlimited try-ons')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));
    expect(await screen.findByText('the preview')).toBeInTheDocument();
  });

  it('says so when the admin has no active styles', async () => {
    backend({ catalogue: { status: 200, body: [] } });
    openPicker();

    expect(await screen.findByText('No styles to try yet')).toBeInTheDocument();
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('offers a retry when the catalogue could not be loaded', async () => {
    backend({ catalogue: 'unreachable' });
    openPicker();

    expect(await screen.findByText('We could not load that')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('try-on home', () => {
  const openHome = () => mount({ at: '/ai-tryon', routes: { '/ai-tryon': <TryOnHomePage /> } });

  it('shows the plan and this month’s credits from the backend', async () => {
    backend({ credits: { status: 200, body: credits(1) } });
    openHome();

    expect(await screen.findByText('2 credits left')).toBeInTheDocument();
    expect(screen.getByText('Free plan')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 used this month/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(await screen.findByText('Plans and credits')).toBeInTheDocument();
    expect(await screen.findByText('Basic')).toBeInTheDocument();
  });

  it('lists the admin styles and nothing hardcoded', async () => {
    backend();
    openHome();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    expect(screen.getByText('Admin braids')).toBeInTheDocument();
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('offers the 360° try-on as the one way in', async () => {
    backend();
    openHome();

    expect(await screen.findByText('360° try-on')).toBeInTheDocument();
    expect(screen.queryByText('Start 360° capture')).not.toBeInTheDocument();
  });

  it('drops the row when there is nothing to show', async () => {
    backend({ catalogue: { status: 200, body: [] } });
    openHome();

    await waitFor(() => expect(requestsTo('/hairstyles/catalogue/')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('All styles')).not.toBeInTheDocument());
  });
});
