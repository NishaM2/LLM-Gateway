import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { SpendDay } from "../../api.ts"
import { formatDay, formatMicros } from "../../format.ts"
import { useChartColors } from "../../theme.tsx"

export function SpendChart({ spend }: { spend: SpendDay[] }) {
  const colors = useChartColors()

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={spend} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={colors.grid} />
        <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors.grid }} minTickGap={24} />
        <YAxis tickFormatter={(value: number) => formatMicros(value)} tick={{ fill: colors.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={84} />
        <Tooltip
          contentStyle={{ background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 8, color: colors.text }}
          labelFormatter={(day) => formatDay(String(day))}
          formatter={(value, _name, item) => [`${formatMicros(Number(value))} across ${item.payload.requests} requests`, "Spend"]}
        />
        <Line isAnimationActive={false} type="linear" dataKey="costMicros" name="Spend" stroke={colors.series1} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
