const STATS = [
  { value: "13×", label: "faster on an exact cache hit (56 ms vs 718 ms)" },
  { value: "30 → 3", label: "wrong semantic matches once the guards are on" },
  { value: "200", label: "hand-labelled question pairs behind the threshold" },
  { value: "$0", label: "to run: free tiers and a local embedding model" },
]

export function StatsStrip() {
  return (
    <div className="stats" role="list">
      {STATS.map((stat) => (
        <div key={stat.value} className="stat" role="listitem">
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
