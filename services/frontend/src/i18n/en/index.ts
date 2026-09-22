import { common } from './common';
import { auth } from './auth';
import { home } from './home';
import { booking } from './booking';
import { tryon } from './tryon';
import { profile } from './profile';
import { provider } from './provider';
import { proQueue } from './proQueue';
import { proBusiness } from './proBusiness';
import { proSalon } from './proSalon';
import { proTeam } from './proTeam';

/** English is the source of truth: every other language is typed against it,
    so a missing translation is a build error rather than a blank screen. */
export const en = {
  ...common,
  ...auth,
  ...home,
  ...booking,
  ...tryon,
  ...profile,
  ...provider,
  ...proQueue,
  ...proBusiness,
  ...proSalon,
  ...proTeam,
};

export type Dictionary = typeof en;
export type TKey = keyof Dictionary;
