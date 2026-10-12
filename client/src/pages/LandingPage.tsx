import { useEffect } from "react"
import { Closing } from "../components/landing/Closing.tsx"
import { Features } from "../components/landing/Features.tsx"
import { Hero } from "../components/landing/Hero.tsx"
import { RequestFlow } from "../components/landing/RequestFlow.tsx"
import { Results } from "../components/landing/Results.tsx"
import { StatsStrip } from "../components/landing/StatsStrip.tsx"
import { SiteFooter } from "../components/layout/SiteFooter.tsx"
import { SiteHeader } from "../components/layout/SiteHeader.tsx"

export function LandingPage() {
  useEffect(() => {
    document.title = "LLM Gateway"
  }, [])

  return (
    <div className="landing">
      <SiteHeader page="landing" />
      <main className="wrap">
        <Hero />
        <StatsStrip />
        <RequestFlow />
        <Results />
        <Features />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
