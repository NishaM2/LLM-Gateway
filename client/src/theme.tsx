import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

export type Theme = "light" | "dark"

export type ChartColors = {
  series1: string
  series2: string
  series1Light: string
  grid: string
  axis: string
  text: string
  surface: string
}

const chartColors: Record<Theme, ChartColors> = {
  light: {
    series1: "#2a78d6",
    series2: "#eb6834",
    series1Light: "#86b6ef",
    grid: "#e4e3df",
    axis: "#52514e",
    text: "#0b0b0b",
    surface: "#fcfcfb",
  },
  dark: {
    series1: "#3987e5",
    series2: "#d95926",
    series1Light: "#1c5cab",
    grid: "#2f2f2d",
    axis: "#c3c2b7",
    text: "#ffffff",
    surface: "#1a1a19",
  },
}

const STORAGE_KEY = "theme"

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} })

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === "dark" ? "light" : "dark"
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {}
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function useChartColors(): ChartColors {
  return chartColors[useTheme().theme]
}
