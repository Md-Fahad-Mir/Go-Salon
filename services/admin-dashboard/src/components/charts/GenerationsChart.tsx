import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { format, parseISO } from 'date-fns';
import type { DailyPoint } from '../../types';
import { useChartTheme } from '../../hooks/useChartTheme';
import { formatCompact, formatNumber, formatShortDate } from '../../utils/format';

interface GenerationsChartProps {
  data: DailyPoint[];
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DailyPoint;
  return (
    <div className="chart-tooltip">
      <strong>
        {formatNumber(point.generations)} {point.generations === 1 ? 'video' : 'videos'}
      </strong>
      <span>
        {format(parseISO(point.date), 'EEE d MMM')}
        {point.highlight ? ' · weekend' : ''}
      </span>
    </div>
  );
}

/** Single-series magnitude-over-time, one bar per day. Weekends (Fri/Sat)
    are picked out in gold and named in the page's legend and the tooltip, so
    the colour is a reinforcement rather than the only cue. */
export function GenerationsChart({ data }: GenerationsChartProps) {
  const theme = useChartTheme();
  const peakFill = `generations-peak-${useId()}`;

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
          <defs>
            <linearGradient id={peakFill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.barHighlight} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.barHighlight} stopOpacity={0.62} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="2 6" />
          <XAxis
            dataKey="date"
            tickFormatter={(iso: string) => formatShortDate(iso)}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={(props) => <ChartTooltip {...props} />}
            cursor={{ fill: theme.grid, opacity: 0.7, radius: 6 }}
          />
          <Bar dataKey="generations" radius={[6, 6, 2, 2]} maxBarSize={26} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.date}
                fill={point.highlight ? `url(#${peakFill})` : theme.bar}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
