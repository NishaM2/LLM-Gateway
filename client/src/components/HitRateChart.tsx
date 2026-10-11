import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { HitRateDay } from "../api.ts"
import { formatDay, formatPercent, lastDays } from "../format.ts"
import { useChartColors } from "../theme.ts"

export function HitRateChart({ daily, days }: { daily: HitRateDay[]; days: number }) {
  const colors = useChartColors()
  const byDay = new Map(daily.map((day) => [day.day, day]))
  const data = lastDays(days).map((day) => {
    const found = byDay.get(day)
    return {
      day,
      exact: found?.exactRate ?? null,
      semantic: found?.semanticRate ?? null,
      lookups: found ? found.exact + found.semantic + found.miss : 0,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={colors.grid} />
        <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors.grid }} minTickGap={24} />
        <YAxis domain={[0, 1]} tickFormatter={(value: number) => formatPercent(value)} tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 8, color: colors.text }}
          labelFormatter={(day, payload) => `${formatDay(String(day))} (${payload?.[0]?.payload?.lookups ?? 0} lookups)`}
          formatter={(value, name) => [value === null ? "no lookups" : formatPercent(Number(value)), name]}
        />
        <Legend wrapperStyle={{ color: colors.axis, fontSize: 13 }} />
        <Line isAnimationActive={false} type="linear" dataKey="exact" name="Exact hits" stroke={colors.series1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: colors.surface }} connectNulls={false} />
        <Line isAnimationActive={false} type="linear" dataKey="semantic" name="Semantic hits" stroke={colors.series2} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: colors.surface }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
