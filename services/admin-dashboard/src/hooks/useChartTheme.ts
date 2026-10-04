import { useMemo } from 'react';
import { useTheme } from './useTheme';
import type { Theme } from './useTheme';

export interface ChartTheme {
  mode: Theme;
  bar: string;
  barHighlight: string;
  line: string;
  grid: string;
  axis: string;
  surface: string;
}

const readVar = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** SVG presentation attributes do not resolve var(), so charts read the
    resolved token values instead. ThemeProvider stamps the theme class on
    <html> synchronously, so this always reads the current palette. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();

  return useMemo(
    () => ({
      // `mode` doubles as the memo key: the resolved values change with it.
      mode: theme,
      bar: readVar('--chart-bar', '#e8e3d8'),
      barHighlight: readVar('--chart-bar-hi', '#b08b55'),
      line: readVar('--chart-line', '#16181d'),
      grid: readVar('--chart-grid', '#efece5'),
      axis: readVar('--chart-axis', '#666b75'),
      surface: readVar('--bg-secondary', '#ffffff'),
    }),
    [theme],
  );
}
