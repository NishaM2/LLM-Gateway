import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { LatencyGroup } from "../api.ts"
import { formatMs } from "../format.ts"
import { useChartColors } from "../theme.ts"

const ORDER = ["hit", "semantic_hit", "miss", "skip"]

const LABELS: Record<string, string> = {
  hit: "Exact hit",
  semantic_hit: "Semantic hit",
  miss: "Miss (asked provider)",
  skip: "Cache skipped",
}

export function LatencyChart({ groups }: { groups: LatencyGroup[] }) {
  const colors = useChartColors()
  const data = [...groups]
    .sort((a, b) => ORDER.indexOf(a.cacheStatus) - ORDER.indexOf(b.cacheStatus))
    .map((group) => ({
      name: LABELS[group.cacheStatus] ?? group.cacheStatus,
      median: group.latencyP50,
      p95: group.latencyP95,
      requests: group.requests,
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={colors.grid} />
        <XAxis dataKey="name" tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors.grid }} interval={0} />
        <YAxis tickFormatter={(value: number) => formatMs(value)} tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ fill: colors.grid, opacity: 0.4 }}
          contentStyle={{ background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 8, color: colors.text }}
          formatter={(value, name) => [formatMs(Number(value)), name]}
          labelFormatter={(label, payload) => `${label} (${payload?.[0]?.payload?.requests ?? 0} requests)`}
        />
        <Legend wrapperStyle={{ color: colors.axis, fontSize: 13 }} />
        <Bar isAnimationActive={false} dataKey="median" name="Median" fill={colors.series1} radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="median" position="top" formatter={(value) => formatMs(Number(value))} fill={colors.text} fontSize={12} />
        </Bar>
        <Bar isAnimationActive={false} dataKey="p95" name="Slowest 5% start at (p95)" fill={colors.series1Light} radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  )
}
