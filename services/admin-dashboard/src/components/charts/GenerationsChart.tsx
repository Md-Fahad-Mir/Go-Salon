import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DailyPoint, TimeRange } from '../../types';
import { useChartTheme } from '../../hooks/useChartTheme';
import { formatCompact, formatNumber } from '../../utils/format';
import { seriesAxisFormat } from '../../mockData/overview';

interface GenerationsChartProps {
  data: DailyPoint[];
  range: TimeRange;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DailyPoint;
  return (
    <div className="chart-tooltip">
      <strong>{formatNumber(point.generations)} generations</strong>
      <span>
        {new Date(point.date).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {point.highlight ? ' · peak period' : ''}
      </span>
    </div>
  );
}

/** Single-series magnitude-over-time. Peak periods (Fri/Sat, or the evening
    rush on the hourly view) are picked out in gold and named in the caption,
    so the colour is a reinforcement rather than the only cue. */
export function GenerationsChart({ data, range }: GenerationsChartProps) {
  const theme = useChartTheme();
  const tickFormat = seriesAxisFormat[range];

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="18%">
          <XAxis
            dataKey="date"
            tickFormatter={tickFormat}
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
            cursor={{ fill: theme.grid, opacity: 0.55 }}
          />
          <Bar dataKey="generations" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.date}
                fill={point.highlight ? theme.barHighlight : theme.bar}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
