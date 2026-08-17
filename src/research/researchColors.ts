/**
 * Semantic research color classification — maps content to CSS accent tokens.
 * Every classification includes a text label; color is supplementary only.
 */

export type ResearchAccent =
  | 'aicpa'
  | 'pcaob'
  | 'verified'
  | 'official-web'
  | 'warning'
  | 'error'
  | 'neutral'
  | 'heading'

export type ConfidenceTone = 'verified' | 'warning' | 'error' | 'neutral'

export function classifyFramework(text: string): 'aicpa' | 'pcaob' | 'neutral' {
  const hay = text.toLowerCase()
  if (/\bpcaob\b|\bas\s+\d{3,4}\b/.test(hay) && !/\bau-?c\b|\baicpa\b|\bgaas\b/.test(hay)) {
    return 'pcaob'
  }
  if (/\bau-?c\b|\baicpa\b|\bgaas\b|\bu\.?s\.?\s*gaas\b/.test(hay)) {
    return 'aicpa'
  }
  if (/\bpcaob\b/.test(hay)) return 'pcaob'
  return 'neutral'
}

export function classifySourceAccent(input: {
  publisher?: string
  title?: string
  section?: string
  authorityType?: string
  internalOrExternal?: string
  verificationStatus?: string
  demoData?: boolean
}): ResearchAccent {
  const hay = `${input.publisher ?? ''} ${input.title ?? ''} ${input.section ?? ''}`.toLowerCase()
  const auth = (input.authorityType ?? '').toLowerCase()
  const verified =
    input.verificationStatus === 'verified' ||
    (input.internalOrExternal === 'internal' && !input.demoData)

  if (/rejected|conflict|unsupported|failed/.test(hay + auth)) return 'error'
  if (/\baicpa\b|\bau-?c\b|\bgaas\b/.test(hay)) return 'aicpa'
  if (/\bpcaob\b|\bas\s+\d{3,4}\b/.test(hay)) return 'pcaob'
  if (
    auth.includes('secondary') ||
    input.verificationStatus === 'unverified' ||
    input.internalOrExternal === 'external'
  ) {
    return input.internalOrExternal === 'external' && verified ? 'official-web' : 'warning'
  }
  if (verified && (auth.includes('primary') || auth.includes('professional') || auth.includes('official'))) {
    return 'verified'
  }
  return 'warning'
}

export function sourceAccentLabel(accent: ResearchAccent): string {
  switch (accent) {
    case 'aicpa':
      return 'AICPA U.S. GAAS'
    case 'pcaob':
      return 'PCAOB'
    case 'verified':
      return 'Verified official authority'
    case 'official-web':
      return 'Official internet source'
    case 'warning':
      return 'Secondary or unverified'
    case 'error':
      return 'Unsupported or rejected'
    case 'neutral':
      return 'Reference'
    case 'heading':
      return 'Research heading'
  }
}

export function originLabel(internalOrExternal?: string, verified?: boolean): string {
  if (internalOrExternal === 'internal') {
    return verified ? 'Uploaded authoritative standard · Verified' : 'Uploaded authoritative standard'
  }
  if (internalOrExternal === 'external') {
    return verified ? 'Official internet authority · Verified' : 'Official internet authority'
  }
  return 'Source'
}

export function confidenceTone(label?: string, score?: number): ConfidenceTone {
  if (label == null && score == null) return 'neutral'
  if (label === 'very_high' || label === 'high') return 'verified'
  if (label === 'moderate') return 'warning'
  if (label === 'low' || label === 'very_low') return 'error'
  if (score != null) {
    if (score >= 75) return 'verified'
    if (score >= 60) return 'warning'
    if (score > 0) return 'error'
  }
  return 'neutral'
}

export function confidenceToneLabel(tone: ConfidenceTone): string {
  switch (tone) {
    case 'verified':
      return 'High support'
    case 'warning':
      return 'Moderate or incomplete coverage'
    case 'error':
      return 'Low support or missing authority'
    case 'neutral':
      return 'Not calculated'
  }
}

export function isInternetFallbackText(text: string): boolean {
  return /searched (the )?official|internet (search|fallback|research)|did not fully resolve|web fallback/i.test(
    text,
  )
}

export function isUnsupportedText(text: string): boolean {
  return /could not locate sufficient|unable to conclude|not verified|unsupported|insufficient (primary )?authority/i.test(
    text,
  )
}

export function sectionHeadingAccent(title: string): ResearchAccent {
  const t = title.toLowerCase()
  if (/pcaob comparison|separate pcaob/.test(t)) return 'pcaob'
  if (/applicable framework|relevant standards|direct conclusion/.test(t)) return 'aicpa'
  if (/missing facts|assumptions|research-path|authority usage/.test(t)) return 'warning'
  if (/effect on the auditor|scope limitation/.test(t)) return 'heading'
  return 'heading'
}

export interface ParsedAnswerSection {
  title: string
  lines: string[]
  accent: ResearchAccent
}

/** Split audit-style markdown answers into sections without coloring body text. */
export function parseResearchAnswerSections(content: string): ParsedAnswerSection[] | null {
  if (!/^##\s/m.test(content)) return null
  const parts = content.split(/^##\s+/m).filter(Boolean)
  if (!parts.length) return null
  return parts.map((block) => {
    const nl = block.indexOf('\n')
    const title = (nl >= 0 ? block.slice(0, nl) : block).trim()
    const body = (nl >= 0 ? block.slice(nl + 1) : '').trim()
    const lines = body ? body.split('\n').filter((l) => l.trim()) : []
    return { title, lines, accent: sectionHeadingAccent(title) }
  })
}
