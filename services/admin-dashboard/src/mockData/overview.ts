import { format, subDays } from 'date-fns';
import type { DailyPoint, KpiDatum, RankedDatum, RevenueSlice, TimeRange } from '../types';
import { PAYMENT_METHOD_VARS } from '../constants';
import { NOW } from './base';

/** Deterministic wobble so the chart looks organic without a second RNG. */
const wobble = (index: number): number =>
  Math.sin(index * 1.7) * 90 + Math.cos(index * 0.6) * 55;

const buildSeries = (days: number, base: number, growth: number): DailyPoint[] =>
  Array.from({ length: days }, (_, index) => {
    const date = subDays(NOW, days - 1 - index);
    const weekday = date.getDay();
    // Friday + Saturday are the Bangladeshi weekend — salon traffic peaks.
    const weekend = weekday === 5 || weekday === 6;
    const value = Math.round(
      base + index * growth + wobble(index) + (weekend ? base * 0.26 : 0),
    );
    return {
      date: date.toISOString(),
      generations: Math.max(120, value),
      highlight: weekend,
    };
  });

const HOURLY = Array.from({ length: 12 }, (_, index) => {
  const hour = 8 + index;
  const date = new Date(NOW);
  date.setHours(hour, 0, 0, 0);
  const peak = hour >= 17 && hour <= 20;
  return {
    date: date.toISOString(),
    generations: Math.round(48 + index * 9 + Math.sin(index * 1.4) * 22 + (peak ? 46 : 0)),
    highlight: peak,
  };
});

export const generationSeries: Record<TimeRange, DailyPoint[]> = {
  '30d': buildSeries(30, 620, 21),
  '7d': buildSeries(7, 1080, 34),
  today: HOURLY,
};

export const seriesAxisFormat: Record<TimeRange, (iso: string) => string> = {
  '30d': (iso) => format(new Date(iso), 'd MMM'),
  '7d': (iso) => format(new Date(iso), 'EEE d'),
  today: (iso) => format(new Date(iso), 'HH:mm'),
};

export const revenueByMethod: Record<TimeRange, RevenueSlice[]> = {
  '30d': [
    { method: 'bkash', label: 'bKash', amount: 404_000, color: PAYMENT_METHOD_VARS.bkash },
    { method: 'nagad', label: 'Nagad', amount: 202_000, color: PAYMENT_METHOD_VARS.nagad },
    { method: 'rocket', label: 'Rocket', amount: 93_000, color: PAYMENT_METHOD_VARS.rocket },
    { method: 'card', label: 'Card', amount: 143_000, color: PAYMENT_METHOD_VARS.card },
  ],
  '7d': [
    { method: 'bkash', label: 'bKash', amount: 96_400, color: PAYMENT_METHOD_VARS.bkash },
    { method: 'nagad', label: 'Nagad', amount: 48_900, color: PAYMENT_METHOD_VARS.nagad },
    { method: 'rocket', label: 'Rocket', amount: 21_200, color: PAYMENT_METHOD_VARS.rocket },
    { method: 'card', label: 'Card', amount: 34_800, color: PAYMENT_METHOD_VARS.card },
  ],
  today: [
    { method: 'bkash', label: 'bKash', amount: 14_200, color: PAYMENT_METHOD_VARS.bkash },
    { method: 'nagad', label: 'Nagad', amount: 7_100, color: PAYMENT_METHOD_VARS.nagad },
    { method: 'rocket', label: 'Rocket', amount: 2_900, color: PAYMENT_METHOD_VARS.rocket },
    { method: 'card', label: 'Card', amount: 5_400, color: PAYMENT_METHOD_VARS.card },
  ],
};

export const topHairstylesByRange: Record<TimeRange, RankedDatum[]> = {
  '30d': [
    { name: 'Textured crop', value: 3182 },
    { name: 'Skin fade', value: 2740 },
    { name: 'Layer cut · women', value: 2106 },
    { name: 'Beard sculpt', value: 1684 },
    { name: 'Holud bridal updo', value: 1402 },
  ],
  '7d': [
    { name: 'Textured crop', value: 742 },
    { name: 'Skin fade', value: 651 },
    { name: 'Layer cut · women', value: 494 },
    { name: 'Beard sculpt', value: 388 },
    { name: 'Curtain fringe', value: 301 },
  ],
  today: [
    { name: 'Skin fade', value: 118 },
    { name: 'Textured crop', value: 104 },
    { name: 'Beard sculpt', value: 76 },
    { name: 'Layer cut · women', value: 63 },
    { name: 'Holud bridal updo', value: 41 },
  ],
};

export const dhakaAreasByRange: Record<TimeRange, RankedDatum[]> = {
  '30d': [
    { name: 'Dhanmondi', value: 1860 },
    { name: 'Gulshan', value: 1512 },
    { name: 'Uttara', value: 1140 },
    { name: 'Mirpur', value: 968 },
  ],
  '7d': [
    { name: 'Dhanmondi', value: 431 },
    { name: 'Gulshan', value: 356 },
    { name: 'Uttara', value: 268 },
    { name: 'Mirpur', value: 214 },
  ],
  today: [
    { name: 'Dhanmondi', value: 74 },
    { name: 'Gulshan', value: 61 },
    { name: 'Uttara', value: 43 },
    { name: 'Mirpur', value: 31 },
  ],
};

export const kpisByRange: Record<TimeRange, KpiDatum[]> = {
  '30d': [
    { id: 'active-users', label: 'Active users', value: '8,412', footnote: '+12% vs last month', tone: 'positive' },
    { id: 'generations', label: 'Generations today', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'success-rate', label: 'Success rate', value: '94.2%', footnote: '−1.1 pts', tone: 'negative' },
    { id: 'avg-generation', label: 'Avg. generation', value: '18.4s', footnote: 'target under 25s', tone: 'neutral' },
    { id: 'spend', label: 'AI spend vs revenue', value: '$1,840 / ৳842k', footnote: 'margin 74%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons this week', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
  '7d': [
    { id: 'active-users', label: 'Active users', value: '3,908', footnote: '+6% vs previous week', tone: 'positive' },
    { id: 'generations', label: 'Generations today', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'success-rate', label: 'Success rate', value: '95.0%', footnote: '+0.8 pts', tone: 'positive' },
    { id: 'avg-generation', label: 'Avg. generation', value: '17.9s', footnote: 'target under 25s', tone: 'neutral' },
    { id: 'spend', label: 'AI spend vs revenue', value: '$436 / ৳201k', footnote: 'margin 76%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons this week', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
  today: [
    { id: 'active-users', label: 'Active users', value: '1,144', footnote: '+2% vs yesterday', tone: 'positive' },
    { id: 'generations', label: 'Generations today', value: '1,286', footnote: '+4% vs yesterday', tone: 'positive' },
    { id: 'success-rate', label: 'Success rate', value: '93.6%', footnote: '−0.6 pts', tone: 'negative' },
    { id: 'avg-generation', label: 'Avg. generation', value: '19.1s', footnote: 'target under 25s', tone: 'neutral' },
    { id: 'spend', label: 'AI spend vs revenue', value: '$61 / ৳29.6k', footnote: 'margin 71%', tone: 'positive' },
    { id: 'new-salons', label: 'New salons this week', value: '23', footnote: '6 awaiting approval', tone: 'neutral' },
  ],
};

export const RANGE_LABELS: Record<TimeRange, string> = {
  '30d': '30 days',
  '7d': '7 days',
  today: 'Today',
};

export const RANGE_CAPTIONS: Record<TimeRange, string> = {
  '30d': 'last 30 days',
  '7d': 'last 7 days',
  today: 'today, hourly',
};
