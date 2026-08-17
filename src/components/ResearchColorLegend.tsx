import { useState } from 'react'

const ITEMS = [
  { accent: 'aicpa' as const, label: 'Blue — AICPA U.S. GAAS / AU-C' },
  { accent: 'pcaob' as const, label: 'Purple — PCAOB comparison' },
  { accent: 'verified' as const, label: 'Green — Verified authority' },
  { accent: 'warning' as const, label: 'Amber — Additional research or uncertainty' },
  { accent: 'error' as const, label: 'Red — Missing or unsupported' },
  { accent: 'neutral' as const, label: 'Gray — Notes and secondary detail' },
]

export function ResearchColorLegend() {
  const [open, setOpen] = useState(false)

  return (
    <details className="research-color-legend" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Color legend (frameworks &amp; authority)</summary>
      <ul className="research-legend-list" aria-label="Research color legend">
        {ITEMS.map((item) => (
          <li key={item.accent}>
            <span className={`research-accent-swatch research-accent-${item.accent}`} aria-hidden />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="field-hint research-legend-note">
        Colors supplement text labels — meaning is never conveyed by color alone.
      </p>
    </details>
  )
}
