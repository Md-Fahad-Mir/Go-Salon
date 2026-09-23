import type { Dictionary } from '../en';
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
import { tenant } from './tenant';

/** Typed as the full English shape, so leaving a key untranslated fails `tsc`. */
export const bn: Record<keyof Dictionary, string> = {
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
  ...tenant,
};
