import React, { Suspense } from "react"
import { Orb, type AgentState } from "@/components/ui/orb"

export function SafeOrb({ colors, seed, agentState }: { colors: [string, string]; seed?: number; agentState?: AgentState }) {
  // Fallback gradient already lives inside Orb; Suspense guards the texture load.
  return (
    <Suspense fallback={<div style={{ position: "absolute", inset: "8%", borderRadius: "50%", background: `radial-gradient(circle at 38% 32%, ${colors[0]}, ${colors[1]} 62%)` }} />}>
      <Orb colors={colors} seed={seed} agentState={agentState} />
    </Suspense>
  )
}

export function Card({ className = "", glow, lift, children }: { className?: string; glow?: boolean; lift?: boolean; children: React.ReactNode }) {
  return <section className={`card${lift ? " lift" : ""}${glow ? " glow" : ""} ${className}`}>{children}</section>
}

export function Tile({ title, badge, footer, contain, children }: { title: string; badge?: string; footer?: React.ReactNode; contain?: boolean; children: React.ReactNode }) {
  return (
    <Card lift>
      <div className="card-h"><h3>{title}</h3>{badge && <span className="badge">{badge}</span>}</div>
      <div className="card-b" style={contain ? { position: "relative", minHeight: 200, overflow: "hidden", display: "block" } : undefined}>{children}</div>
      {footer && <div className="card-f">{footer}</div>}
    </Card>
  )
}

export const RailHead = ({ n, title, blurb }: { n: string; title: string; blurb?: string }) => (
  <div className="rail-head">
    <span className="rail-num">{n}</span>
    <h2 className="rail-title">{title}</h2>
    {blurb && <span className="rail-blurb">{blurb}</span>}
  </div>
)

export const Grid = ({ min, className = "", children }: { min: number; className?: string; children: React.ReactNode }) => (
  <div className={`grid ${className}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>
)

export function OrbTile({ name, colors, seed, agentState }: { name: string; colors: [string, string]; seed?: number; agentState: AgentState }) {
  return (
    <Card lift>
      <div className="card-h"><h3>{name}</h3></div>
      <div className="card-b">
        <div className="orb-tile">
          <div className="orb-ring"><div className="orb-inner"><SafeOrb colors={colors} seed={seed} agentState={agentState} /></div></div>
          <span className="orb-name">{(agentState ?? "idle")}</span>
        </div>
      </div>
    </Card>
  )
}
