/* The try-on picker offers the admin's catalogue and nothing else, and renders
   a chosen style with the prompt the admin wrote for it. */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { requestsTo, route } from '../../test/http';
import { mount } from '../../test/render';
import type { HairProfile, User } from '../../types';
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

const someone = (): User => ({
  id: 'U1', name: 'Test Person', role: 'customer',
  phone: '+8801955000009', createdAt: '2026-01-01T00:00:00.000Z', credits: 5,
});

const PROFILE: HairProfile = {
  faceShape: 'oval', faceShapeConfidence: 80, hairTexture: 'straight', hairDensity: 'medium',
  hairLengthObserved: 'short', hairLengthCategory: 'short', currentHairstyle: 'crop',
  hairHealthScore: 80, hairColor: 'black', skinTone: 'medium', undertone: 'warm',
  hasBeard: false, beardStyle: '',
};

const GENERATED = {
  status: 200,
  body: { image: { b64: btoa('rendered'), mime_type: 'image/png' }, meta: { model: 'test', latency_ms: 1 } },
};

const PRISTINE_APP = useAppStore.getState();
const PRISTINE_TRYON = useTryOnStore.getState();

beforeEach(async () => {
  useAppStore.setState(PRISTINE_APP, true);
  useAppStore.getState().setAuthStatus('ready');
  useAppStore.getState().setSession({ user: someone(), access: 'a', refresh: 'r' });
  useTryOnStore.setState(PRISTINE_TRYON, true);
  // An analysis already in hand for this photo, so the screen goes straight
  // to the catalogue rather than calling the vision model first.
  useTryOnStore.setState({
    photoKey: PHOTO,
    analysis: {
      recommendations: [], profile: PROFILE, summary: '', model: 'test',
      photoKey: PHOTO, createdAt: '2026-01-01T00:00:00.000Z',
    },
  });
  await photoStore.put(PHOTO, new Blob(['photo'], { type: 'image/jpeg' }));
});

const openPicker = () =>
  mount({
    at: '/ai-tryon/select',
    routes: {
      '/ai-tryon/select': <StyleSelectPage />,
      '/ai-tryon/preview/:id': <p>the preview</p>,
    },
  });

/** The multipart body of the one `/generate` call. */
const generateForm = (): FormData => {
  const call = (fetch as Mock).mock.calls.find(([url]) => String(url).includes('/generate'));
  expect(call, 'no /generate request was made').toBeDefined();
  return call![1].body as FormData;
};

describe('style picker', () => {
  it('shows the admin styles — name, category and image — and no hardcoded ones', async () => {
    route([['/hairstyles/catalogue/', { status: 200, body: [FADE, BRAIDS] }]]);
    openPicker();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    expect(screen.getByText('Admin braids')).toBeInTheDocument();
    expect(screen.getByText('Haircut')).toBeInTheDocument();
    expect(screen.getByText('Braiding')).toBeInTheDocument();
    expect(screen.getByAltText('Admin fade hairstyle')).toHaveAttribute('src', FADE.image);
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
    expect(requestsTo('/hairstyles/catalogue/')).toHaveLength(1);
  });

  it('renders a chosen style with the prompt the admin wrote for it', async () => {
    route([
      ['/hairstyles/catalogue/', { status: 200, body: [FADE, BRAIDS] }],
      ['/generate', GENERATED],
    ]);
    openPicker();

    await userEvent.click(await screen.findByRole('button', { name: /Admin fade/ }));

    expect(await screen.findByText('the preview')).toBeInTheDocument();
    const form = generateForm();
    expect(form.get('hairstyle_id')).toBe('7');
    expect(form.get('hairstyle_name')).toBe('Admin fade');
    expect(form.get('hairstyle_description')).toBe('A crisp mid fade with a short textured top');
  });

  it('starts a style picked earlier, looked up in the catalogue as it is now', async () => {
    useTryOnStore.setState({ selectedHairstyleId: '9' });
    route([
      ['/hairstyles/catalogue/', { status: 200, body: [FADE, BRAIDS] }],
      ['/generate', GENERATED],
    ]);
    openPicker();

    expect(await screen.findByText('the preview')).toBeInTheDocument();
    expect(generateForm().get('hairstyle_description')).toBe('Medium knotless box braids');
  });

  it('does not start a style the admin switched off after it was picked', async () => {
    useTryOnStore.setState({ selectedHairstyleId: '3' });
    route([['/hairstyles/catalogue/', { status: 200, body: [FADE] }]]);
    openPicker();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    await waitFor(() => expect(useTryOnStore.getState().selectedHairstyleId).toBeNull());
    expect(requestsTo('/generate')).toHaveLength(0);
  });

  it('says so when the admin has no active styles', async () => {
    route([['/hairstyles/catalogue/', { status: 200, body: [] }]]);
    openPicker();

    expect(await screen.findByText('No styles to try yet')).toBeInTheDocument();
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('offers a retry when the catalogue could not be loaded', async () => {
    route([['/hairstyles/catalogue/', 'unreachable']]);
    openPicker();

    expect(await screen.findByText('We could not load that')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('try-on home', () => {
  const openHome = () => mount({ at: '/ai-tryon', routes: { '/ai-tryon': <TryOnHomePage /> } });

  it('lists the admin styles and nothing hardcoded', async () => {
    route([['/hairstyles/catalogue/', { status: 200, body: [FADE, BRAIDS] }]]);
    openHome();

    expect(await screen.findByText('Admin fade')).toBeInTheDocument();
    expect(screen.getByText('Admin braids')).toBeInTheDocument();
    for (const name of OLD_MOCK_NAMES) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('drops the row when there is nothing to show', async () => {
    route([['/hairstyles/catalogue/', { status: 200, body: [] }]]);
    openHome();

    await waitFor(() => expect(requestsTo('/hairstyles/catalogue/')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('All styles')).not.toBeInTheDocument());
  });
});
