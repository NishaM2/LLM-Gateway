import { useEffect, useState } from "react"

export type ChartColors = {
  series1: string
  series2: string
  series1Light: string
  grid: string
  axis: string
  text: string
  surface: string
}

const light: ChartColors = {
  series1: "#2a78d6",
  series2: "#eb6834",
  series1Light: "#86b6ef",
  grid: "#e4e3df",
  axis: "#52514e",
  text: "#0b0b0b",
  surface: "#fcfcfb",
}

const dark: ChartColors = {
  series1: "#3987e5",
  series2: "#d95926",
  series1Light: "#1c5cab",
  grid: "#2f2f2d",
  axis: "#c3c2b7",
  text: "#ffffff",
  surface: "#1a1a19",
}

const query = "(prefers-color-scheme: dark)"

export function useChartColors(): ChartColors {
  const [isDark, setIsDark] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setIsDark(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isDark ? dark : light
}
