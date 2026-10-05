import type { KpiDatum, TimeRange } from '../types';

export const kpisByRange: Record<TimeRange, KpiDatum[]> = {
  '30d': [
    { id: 'active-users', label: 'Active users', value: '8,412', footnote: '+12% vs last month', tone: 'positive' },
    { id: 'tryon-videos', label: '360° try-on video', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'spend', label: 'AI spend vs revenue', value: '৳224k / ৳842k', footnote: 'margin 74%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons Created', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
  '7d': [
    { id: 'active-users', label: 'Active users', value: '3,908', footnote: '+6% vs previous week', tone: 'positive' },
    { id: 'tryon-videos', label: '360° try-on video', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'spend', label: 'AI spend vs revenue', value: '৳53k / ৳201k', footnote: 'margin 76%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons Created', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
  today: [
    { id: 'active-users', label: 'Active users', value: '1,144', footnote: '+2% vs yesterday', tone: 'positive' },
    { id: 'tryon-videos', label: '360° try-on video', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'spend', label: 'AI spend vs revenue', value: '৳7.4k / ৳29.6k', footnote: 'margin 71%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons Created', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
};

export const RANGE_CAPTIONS: Record<TimeRange, string> = {
  '30d': 'last 30 days',
  '7d': 'last 7 days',
  today: 'today, hourly',
};
