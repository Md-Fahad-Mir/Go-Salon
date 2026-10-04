/* A try-on result: the 360° video now, and the older still results that are
   still on some devices — both must open. */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { useTryOnStore } from '../../store/useTryOnStore';
import { serveNothing } from '../../test/http';
import { mount } from '../../test/render';
import type { AIGeneration } from '../../types';
import { photoStore } from '../../utils/storage';
import PreviewPage from './PreviewPage';

const VIDEO_RESULT: AIGeneration = {
  id: 'GEN-1', hairstyleId: '7', hairstyleName: 'Admin fade', createdAt: '2026-10-04T10:00:00Z',
  feasibility: 'moderate', sourceKey: 'photo:1', resultKey: 'result:GEN-1', videoKey: 'video:GEN-1',
  origin: 'catalogue', model: 'kwaivgi/kling-v3.0-std',
};
const STILL_RESULT: AIGeneration = {
  id: 'GEN-2', hairstyleId: 'HS-101', hairstyleName: 'Textured crop', createdAt: '2026-09-01T10:00:00Z',
  feasibility: 'easy', sourceKey: 'photo:2', resultKey: 'result:GEN-2', origin: 'catalogue',
};

const PRISTINE_APP = useAppStore.getState();

beforeEach(async () => {
  serveNothing();
  useAppStore.setState(PRISTINE_APP, true);
  useAppStore.getState().setAuthStatus('ready');
  useAppStore.getState().setSession({
    user: { id: 'U1', name: 'T', role: 'customer', phone: '+8801955000009', createdAt: '', credits: 3 },
    access: 'a',
    refresh: 'r',
  });
  useAppStore.setState({ generations: [VIDEO_RESULT, STILL_RESULT] });
  useTryOnStore.setState({ photoKey: null, pending: null });
  await Promise.all([
    photoStore.put('photo:1', new Blob(['p1'], { type: 'image/jpeg' })),
    photoStore.put('result:GEN-1', new Blob(['poster'], { type: 'image/jpeg' })),
    photoStore.put('video:GEN-1', new Blob(['mp4'], { type: 'video/mp4' })),
    photoStore.put('photo:2', new Blob(['p2'], { type: 'image/jpeg' })),
    photoStore.put('result:GEN-2', new Blob(['still'], { type: 'image/jpeg' })),
  ]);
});

const open = (id: string) =>
  mount({
    at: `/ai-tryon/preview/${id}`,
    routes: { '/ai-tryon/preview/:id': <PreviewPage />, '/ai-tryon': <p>try-on home</p> },
  });

describe('preview', () => {
  it('plays a 360° result as a looping, silent video', async () => {
    open('GEN-1');
    // The still stands in (with the same label) until the clip is read from the device.
    const video = await waitFor(() => {
      const found = document.querySelector('video');
      expect(found).not.toBeNull();
      return found as HTMLVideoElement;
    });
    expect(video).toHaveAccessibleName('360° video of you with Admin fade');
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('src');
    expect(screen.getByRole('button', { name: 'Save video' })).toBeInTheDocument();
  });

  it('still opens a result from before the video', async () => {
    open('GEN-2');
    expect(await screen.findByRole('button', { name: 'Save photo' })).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });

  it('deleting a 360° result removes its video from the device too', async () => {
    open('GEN-1');
    await userEvent.click(await screen.findByRole('button', { name: 'More options' }));
    await userEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('try-on home')).toBeInTheDocument();
    await waitFor(async () => expect(await photoStore.get('video:GEN-1')).toBeUndefined());
    expect(await photoStore.get('result:GEN-1')).toBeUndefined();
    expect(useAppStore.getState().generations.map((g) => g.id)).toEqual(['GEN-2']);
  });
});
