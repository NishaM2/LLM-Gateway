import { lazy, Suspense, useEffect } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router"
import { LandingPage } from "./pages/LandingPage.tsx"

const DashboardPage = lazy(() => import("./pages/DashboardPage.tsx").then((module) => ({ default: module.DashboardPage })))

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<p className="page-loading">Loading the dashboard…</p>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
