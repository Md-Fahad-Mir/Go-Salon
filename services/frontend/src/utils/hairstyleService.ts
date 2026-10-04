/* The AI try-on catalogue: the styles an admin curates in the admin
   dashboard, and the only ones the try-on offers.

   Read-only from here. The server sends active styles and nothing else, so an
   admin switching a style off or deleting it is what takes it out of the app —
   there is no copy of the list kept on the device to go stale, and every
   screen that shows it asks again when it opens. */

import type { Hairstyle } from '../types';
import { api } from './apiClient';

/** The wire shape. `prompt` is the admin's "Prompt" field verbatim. */
interface ApiHairstyle {
  id: number;
  name: string;
  category: string;
  prompt: string;
  image: string;
}

/** A stable 0–5 from the id, so a style's placeholder keeps its colour
    between visits and neighbouring cards do not all draw the same one. */
export const hairstyleTone = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % 6;
};

const toHairstyle = (row: ApiHairstyle): Hairstyle => {
  const id = String(row.id);
  return {
    id,
    name: row.name,
    category: row.category,
    prompt: row.prompt ?? '',
    image: row.image ?? '',
    tone: hairstyleTone(id),
  };
};

export const hairstyleService = {
  /** `GET /api/hairstyles/catalogue/` — every active style, newest first. */
  list: () => api.get<ApiHairstyle[]>('/hairstyles/catalogue/').then((rows) => rows.map(toHairstyle)),

  /** `GET /api/hairstyles/catalogue/<id>/` — one active style. A style the
      admin has switched off answers 404, the same as one that was deleted. */
  get: (id: string) =>
    api.get<ApiHairstyle>(`/hairstyles/catalogue/${encodeURIComponent(id)}/`).then(toHairstyle),
};
