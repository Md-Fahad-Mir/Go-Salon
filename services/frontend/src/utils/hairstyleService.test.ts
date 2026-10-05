/* The try-on catalogue client: one endpoint, read-only, admin's data verbatim. */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { sent, serve } from '../test/http';
import { ApiError } from './apiError';
import { hairstyleService, hairstyleTone } from './hairstyleService';

const ROW = {
  id: 7,
  name: 'Textured crop',
  category: 'Haircut',
  prompt: 'A textured crop haircut, short on the sides, tousled on top',
  image: 'data:image/png;base64,iVBORw0KGgo=',
};

beforeEach(() => {
  useAppStore.getState().setSession({
    user: { id: 'U1', name: 'T', role: 'customer', phone: '+8801955000009', createdAt: '' },
    access: 'a',
    refresh: 'r',
  });
});

describe('hairstyleService', () => {
  it('reads the admin catalogue endpoint and keeps what the admin entered', async () => {
    serve({ status: 200, body: [ROW] });
    const [style] = await hairstyleService.list();

    expect(sent[0].url).toBe('http://api.test/api/hairstyles/catalogue/');
    expect(sent[0].method).toBe('GET');
    expect(style).toEqual({
      id: '7',
      name: 'Textured crop',
      category: 'Haircut',
      prompt: 'A textured crop haircut, short on the sides, tousled on top',
      image: 'data:image/png;base64,iVBORw0KGgo=',
      tone: hairstyleTone('7'),
    });
  });

  it('answers an empty catalogue with an empty list, not a fallback', async () => {
    serve({ status: 200, body: [] });
    expect(await hairstyleService.list()).toEqual([]);
  });

  it('surfaces a switched-off style as a 404', async () => {
    serve({ status: 404, body: { detail: 'No such hairstyle.', code: 'not_found', errors: {} } });
    const failure = await hairstyleService.get('7').catch((error: unknown) => error);
    expect(sent[0].url).toBe('http://api.test/api/hairstyles/catalogue/7/');
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
  });

  it('gives each style a stable placeholder tone in range', () => {
    expect(hairstyleTone('7')).toBe(hairstyleTone('7'));
    for (const id of ['1', '2', '42', '1000']) {
      expect(hairstyleTone(id)).toBeGreaterThanOrEqual(0);
      expect(hairstyleTone(id)).toBeLessThan(6);
    }
  });
});
