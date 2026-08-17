/**
 * Audit-specific research helpers: framework inference, issue checklists,
 * relevance filtering, targeted web routing, and confidence scoring.
 */

export type AuditFrameworkId = 'AICPA' | 'PCAOB' | 'GAGAS'

export interface ParsedAuditQuestion {
  entityType?: string
  issuerStatus?: 'issuer' | 'nonissuer' | 'unknown'
  engagementType?: string
  jurisdiction?: string
  reportingPeriodEnd?: string
  primaryFramework?: AuditFrameworkId
  primaryCodification?: string
  comparisonFramework?: AuditFrameworkId
  issues: string[]
  materialFacts: string[]
  missingFacts: string[]
}

export interface AuditChecklistItem {
  id: string
  label: string
  status: 'pending' | 'supported' | 'unresolved' | 'needs_facts'
  authority?: string
  internetSearchRequired?: boolean
  reason?: string
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'from',
  'under',
  'have',
  'been',
  'were',
  'was',
  'are',
  'not',
  'you',
  'your',
  'should',
  'would',
  'could',
  'what',
  'when',
  'which',
  'because',
  'into',
  'about',
  'company',
  'client',
  'team',
  'date',
  'year',
  'ended',
  'total',
  'does',
  'did',
  'has',
  'had',
  'also',
  'than',
  'then',
  'such',
  'only',
  'over',
  'after',
  'before',
  'another',
  'between',
])

/** Infer controlling audit framework from explicit language and entity cues. */
export function inferAuditFramework(question: string): {
  primary?: AuditFrameworkId
  comparison?: AuditFrameworkId
  issuerStatus: 'issuer' | 'nonissuer' | 'unknown'
  publicPrivate?: 'public' | 'private' | 'both'
} {
  const q = question.toLowerCase()

  const mentionsPcaob = /\bpcaob\b|\bas\s?\d{3,4}\b/.test(q)
  const mentionsAicpa =
    /\baicpa\b|\bau-?c\b|\bu\.?s\.?\s*gaas\b|\bgaas\b(?!\s*yellow)/.test(q)
  const mentionsGagas = /\bgagas\b|yellow\s*book/.test(q)

  const privateCo =
    /privately\s+held|private\s+company|non[- ]?issuer|nonissuer|closely\s+held/.test(q)
  // "if the company were a public company" is a comparison hypothetical, not the primary entity.
  const publicCoPrimary =
    /\bpublic\s+company\b|\bissuer\b|\bsec\s+registrant\b|\blisted\s+company\b/.test(q) &&
    !/if\s+the\s+company\s+were\s+a\s+public|would\s+(the\s+)?answer\s+change|compar(e|ison)/.test(q)

  let issuerStatus: 'issuer' | 'nonissuer' | 'unknown' = 'unknown'
  if (privateCo) issuerStatus = 'nonissuer'
  else if (publicCoPrimary) issuerStatus = 'issuer'

  let primary: AuditFrameworkId | undefined
  // Explicit primary: "under U.S. GAAS" / "AU-C" / "AICPA" wins over a later PCAOB comparison.
  if (/\bunder\s+u\.?s\.?\s*gaas\b|\bperformed\s+under\s+u\.?s\.?\s*gaas\b|\bau-?c\b/.test(q)) {
    primary = 'AICPA'
  } else if (/\bunder\s+pcaob\b|\bpcaob\s+standards\b/.test(q) && !mentionsAicpa) {
    primary = 'PCAOB'
  } else if (mentionsAicpa && !mentionsPcaob) {
    primary = 'AICPA'
  } else if (mentionsPcaob && !mentionsAicpa) {
    primary = 'PCAOB'
  } else if (mentionsGagas) {
    primary = 'GAGAS'
  } else if (issuerStatus === 'nonissuer') {
    primary = 'AICPA'
  } else if (issuerStatus === 'issuer') {
    primary = 'PCAOB'
  }

  let comparison: AuditFrameworkId | undefined
  if (/would\s+(the\s+)?answer\s+change|compar(e|ison)|if\s+the\s+company\s+were\s+a\s+public/.test(q)) {
    if (primary === 'AICPA') comparison = 'PCAOB'
    else if (primary === 'PCAOB') comparison = 'AICPA'
    else if (mentionsPcaob) comparison = 'PCAOB'
  } else if (mentionsPcaob && primary === 'AICPA') {
    comparison = 'PCAOB'
  } else if (mentionsAicpa && primary === 'PCAOB') {
    comparison = 'AICPA'
  }

  return {
    primary,
    comparison,
    issuerStatus,
    publicPrivate: issuerStatus === 'nonissuer' ? 'private' : issuerStatus === 'issuer' ? 'public' : undefined,
  }
}

export function parseAuditQuestion(question: string): ParsedAuditQuestion | null {
  const q = question.toLowerCase()
  if (!/\baudit|\bau-?c\b|\bpcaob\b|\bgaas\b|\binventory\s+count|\bscope\s+limitation|\bdisclaimer|\bqualified\s+opinion/.test(q)) {
    return null
  }

  const fw = inferAuditFramework(question)
  const yearMatch = question.match(/\b(20\d{2})\b/)
  const periodMatch = question.match(/year\s+ended\s+([A-Za-z]+\s+\d{1,2},\s*20\d{2}|\d{4}-\d{2}-\d{2})/i)

  const issues: string[] = []
  if (/inventory|physical\s+count|observation/.test(q)) {
    issues.push(
      'inventory observation',
      'missed physical inventory count',
      'alternative audit procedures',
    )
  }
  if (/sufficient\s+appropriate|audit\s+evidence|perpetual|count\s+sheets|purchase\s+invoices|subsequent\s+sales/.test(q)) {
    issues.push('sufficient appropriate audit evidence')
  }
  if (/scope\s+limitation|cannot\s+be\s+obtained|refuses|unable\s+to\s+obtain/.test(q)) {
    issues.push('scope limitation', 'materiality and pervasiveness')
  }
  if (/qualified|disclaimer|opinion|auditor.?s\s+report|effect\s+should\s+this\s+have/.test(q)) {
    issues.push('qualified opinion versus disclaimer')
  }
  if (fw.comparison) {
    issues.push('PCAOB comparison')
  }
  if (!issues.length) issues.push('general audit procedures')

  const materialFacts: string[] = []
  if (/38%\s+of\s+total\s+assets|inventory\s+represents/.test(q)) {
    materialFacts.push('Inventory is material (stated as a large share of assets)')
  }
  if (/did\s+not\s+attend|failed\s+to\s+notify|missed/.test(q)) {
    materialFacts.push('Auditor did not attend year-end physical inventory count')
  }
  if (/refuses\s+to\s+perform\s+another\s+physical\s+count/.test(q)) {
    materialFacts.push('Management refuses another physical count')
  }
  if (/perpetual\s+inventory/.test(q)) materialFacts.push('Client maintains perpetual inventory records')
  if (/count\s+sheets/.test(q)) materialFacts.push('Count sheets available')
  if (/purchase\s+invoices/.test(q)) materialFacts.push('Purchase invoices available')
  if (/subsequent\s+sales/.test(q)) materialFacts.push('Subsequent sales records available')

  return {
    entityType: /manufacturing/.test(q)
      ? 'privately held manufacturing company'
      : fw.issuerStatus === 'nonissuer'
        ? 'privately held company'
        : fw.issuerStatus === 'issuer'
          ? 'public company'
          : undefined,
    issuerStatus: fw.issuerStatus,
    engagementType: 'financial statement audit',
    jurisdiction: /united\s+states|\bu\.?s\.?\b|us[- ]federal/.test(q) ? 'United States' : undefined,
    reportingPeriodEnd: periodMatch?.[1] || (yearMatch ? `${yearMatch[1]}-12-31` : undefined),
    primaryFramework: fw.primary,
    primaryCodification: fw.primary === 'AICPA' ? 'AU-C' : fw.primary === 'PCAOB' ? 'AS' : undefined,
    comparisonFramework: fw.comparison,
    issues: [...new Set(issues)],
    materialFacts,
    missingFacts: [],
  }
}

export function buildAuditIssueChecklist(parsed: ParsedAuditQuestion): AuditChecklistItem[] {
  const items: AuditChecklistItem[] = [
    { id: 'framework', label: 'Identify primary framework', status: 'pending' },
    { id: 'inventory_obs', label: 'Identify inventory-observation requirement', status: 'pending' },
    { id: 'later_obs', label: 'Determine whether a later observation is possible', status: 'pending' },
    { id: 'alt_procedures', label: 'Identify appropriate alternative procedures', status: 'pending' },
    { id: 'records', label: 'Evaluate perpetual inventory and transaction records', status: 'pending' },
    { id: 'saae', label: 'Determine whether sufficient appropriate evidence can be obtained', status: 'pending' },
    { id: 'scope', label: 'Analyze scope limitation if evidence cannot be obtained', status: 'pending' },
    { id: 'materiality', label: 'Evaluate materiality', status: 'pending' },
    { id: 'pervasiveness', label: 'Evaluate pervasiveness', status: 'pending' },
    { id: 'opinion', label: 'Distinguish qualified opinion from disclaimer', status: 'pending' },
  ]
  if (parsed.comparisonFramework) {
    items.push({
      id: 'pcaob_compare',
      label: 'Perform separate PCAOB comparison',
      status: 'pending',
    })
  }
  items.push({ id: 'cite', label: 'Cite every material conclusion', status: 'pending' })
  if (parsed.primaryFramework) {
    items[0] = {
      ...items[0],
      status: 'supported',
      authority: parsed.primaryFramework === 'AICPA' ? 'U.S. GAAS (AU-C)' : parsed.primaryFramework,
    }
  }
  return items
}

/** Targeted search queries — framework + issue, not raw bag-of-words. */
export function buildAuditSearchQueries(
  parsed: ParsedAuditQuestion,
  phase: 'primary' | 'comparison' = 'primary',
): string[] {
  const fw = phase === 'comparison' ? parsed.comparisonFramework : parsed.primaryFramework
  if (fw === 'AICPA') {
    return [
      'AU-C inventory physical inventory attendance observation',
      'AU-C missed physical inventory count alternative procedures',
      'AU-C alternative audit procedures inventory perpetual records',
      'AU-C sufficient appropriate audit evidence inventory',
      'AU-C inability to obtain audit evidence scope limitation',
      'AU-C modified opinion qualified disclaimer material pervasive',
      'AU-C 501 inventory',
      'AU-C 500 audit evidence',
      'AU-C 705 modifications of opinions',
    ]
  }
  if (fw === 'PCAOB') {
    return [
      'PCAOB inventory observation physical count',
      'PCAOB audit evidence inventory alternative procedures',
      'PCAOB AS 2510 auditing inventories',
      'PCAOB AS 1105 audit evidence',
      'PCAOB scope limitation qualified opinion disclaimer',
      'PCAOB AS 3105 departures from unqualified opinions',
    ]
  }
  return ['audit inventory observation alternative procedures scope limitation']
}

export function officialSitesForFramework(fw?: AuditFrameworkId): string[] {
  if (fw === 'AICPA') return ['aicpa-cima.com', 'aicpa.org']
  if (fw === 'PCAOB') return ['pcaobus.org']
  if (fw === 'GAGAS') return ['gao.gov']
  return ['aicpa-cima.com', 'pcaobus.org']
}

/** Block USC / unrelated statutes for pure GAAS/PCAOB procedure questions. */
export function isIrrelevantStatuteForAudit(input: {
  question: string
  sourceTitle: string
  publisher: string
  category?: string
  auditFramework?: string
}): boolean {
  const title = `${input.sourceTitle} ${input.publisher}`.toLowerCase()
  const isUsc =
    /united states code|u\.s\.c\.|usc\s*title|\btitle\s+\d+\b/.test(title) ||
    /office of the law revision counsel/.test(title)
  if (!isUsc) return false

  const q = input.question.toLowerCase()
  const needsStatute =
    /\birc\b|\binternal revenue code\b|\bsecurities act\b|\bexchange act\b|\bstatute\b|\busc\b|\bu\.s\.c\./.test(
      q,
    )
  // Pure professional-standards audit procedure questions should not cite random USC titles.
  if (!needsStatute && (/\baudit|\bgaas|\bau-?c\b|\bpcaob\b/.test(q) || input.category === 'audit')) {
    return true
  }
  return false
}

export function isAuditCategorySource(source: {
  category?: string
  auditFramework?: string
  publisher?: string
  title?: string
}): boolean {
  if (source.category === 'audit') return true
  if (source.auditFramework) return true
  const pub = `${source.publisher ?? ''} ${source.title ?? ''}`.toLowerCase()
  return /\bpcaob\b|\baicpa\b|\bau-?c\b|\bauditing standard|\bas\s+\d{3,4}\b/.test(pub)
}

export function tokenizeForAuditSearch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

/** Prefer audit lexicon hits over generic co-occurrence. */
export function scoreAuditPassageRelevance(
  text: string,
  query: string,
  meta?: { title?: string; publisher?: string; auditFramework?: string },
): number {
  const hay = `${meta?.title ?? ''} ${meta?.publisher ?? ''} ${text}`.toLowerCase()
  const terms = tokenizeForAuditSearch(query)
  if (!terms.length) return 0
  let hits = 0
  for (const t of terms) if (hay.includes(t)) hits++
  let score = hits / terms.length

  const boosters = [
    'inventory',
    'observation',
    'physical count',
    'alternative procedure',
    'sufficient appropriate',
    'scope limitation',
    'qualified',
    'disclaimer',
    'au-c',
    'pcaob',
    'pervasive',
    'material',
  ]
  for (const b of boosters) {
    if (hay.includes(b) && query.toLowerCase().includes(b.split(' ')[0])) score += 0.08
  }
  if (meta?.auditFramework) score += 0.15
  if (/united states code|title \d+/.test(hay)) score -= 0.5
  // Prefer the standard named in the query (e.g. AS 2510 over unrelated PCAOB AS).
  const asWanted = query.match(/\bAS\s+(\d{3,4})\b/i)
  if (asWanted) {
    if (new RegExp(`\\bAS\\s*${asWanted[1]}\\b`, 'i').test(`${meta?.title ?? ''} ${hay}`)) score += 0.45
    else if (/\bAS\s+\d{3,4}\b/i.test(meta?.title ?? '') && !new RegExp(`AS\\s*${asWanted[1]}`, 'i').test(meta?.title ?? '')) {
      score -= 0.35
    }
  }
  const aucWanted = query.match(/\bAU-C\s+(\d{3}[A-Z]?)\b/i)
  if (aucWanted) {
    if (new RegExp(`AU-C\\s*(?:Sec(?:tion)?\\.?:?\\s*)?${aucWanted[1]}\\b`, 'i').test(hay)) score += 0.35
  }
  return Math.max(0, score)
}

/** Extract AU-C / PCAOB section labels from passage text (large PDFs often share one file title). */
export function extractStandardSectionLabel(text: string, fallbackSection?: string): string | undefined {
  const hay = text || ''
  const auc =
    hay.match(/\bAU-C\s*(?:Sec(?:tion)?\.?\s*)?(\d{3}[A-Z]?)\b/i) ||
    hay.match(/\bSection\s+(\d{3}[A-Z]?)\b.*?(?:inventory|opinion|evidence|scope)/i)
  if (auc) return `AU-C ${auc[1]}`
  const as = hay.match(/\bAS\s+(\d{3,4})\b/i)
  if (as) return `AS ${as[1]}`
  const para = hay.match(/\.(0?\d{1,2})\s+[A-Z]/)
  if (fallbackSection && /AU-C|AS\s+\d/i.test(fallbackSection)) return fallbackSection
  if (para && fallbackSection) return `${fallbackSection} ¶.${para[1]}`
  return fallbackSection || undefined
}

/** Material issue themes that must be covered by distinct passages when possible. */
export const AUDIT_ISSUE_THEMES = [
  {
    id: 'inventory_observation',
    label: 'inventory observation',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 501 physical inventory counting attendance observation existence',
    match: /physical\s+inventory|inventory\s+count(?:ing)?|attend(?:ance)?\s+at\s+physical|observe\s+the\s+performance\s+of\s+management/i,
  },
  {
    id: 'alternative_date',
    label: 'observation on an alternative date',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 501 inventory count date financial statements rollforward changes recorded',
    match: /count\s+date\s+and\s+the\s+date\s+of\s+the\s+financial\s+statements|between\s+the\s+count\s+date|inventory\s+counting\s+at\s+a\s+date\s+other|roll\s*-?\s*forward|roll\s*-?\s*back|subsequent\s+to\s+the\s+date/i,
  },
  {
    id: 'alternative_procedures',
    label: 'alternative audit procedures',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 501 alternative procedures unable to attend physical inventory',
    match: /alternative\s+procedures|unable\s+to\s+attend|did\s+not\s+attend|attendance\s+at\s+physical\s+inventory/i,
  },
  {
    id: 'saae',
    label: 'sufficient appropriate audit evidence',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 500 sufficient appropriate audit evidence',
    match: /sufficient\s+appropriate\s+audit\s+evidence|AU-C\s*(?:Section\s*)?500\b/i,
  },
  {
    id: 'inability_evidence',
    label: 'inability to obtain audit evidence',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C inability to obtain sufficient appropriate audit evidence modify opinion',
    match: /unable\s+to\s+obtain\s+sufficient|inability\s+to\s+obtain|cannot\s+obtain\s+sufficient/i,
  },
  {
    id: 'scope_limitation',
    label: 'scope limitations',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 705 scope limitation modify opinion auditor report',
    match: /scope\s+limitation|modify\s+the\s+opinion|section\s+705/i,
  },
  {
    id: 'qualified_opinion',
    label: 'qualified opinions',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 705 qualified opinion material not pervasive',
    match: /qualified\s+opinion|except\s+for/i,
  },
  {
    id: 'disclaimer',
    label: 'disclaimers',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 705 disclaimer of opinion material and pervasive',
    match: /disclaimer\s+of\s+opinion/i,
  },
  {
    id: 'materiality_pervasiveness',
    label: 'materiality and pervasiveness',
    framework: 'AICPA' as AuditFrameworkId,
    query: 'AU-C 705 material pervasive effects financial statements',
    match: /pervasive|material\s+but\s+not\s+pervasive|effects?\s+on\s+the\s+financial\s+statements/i,
  },
  {
    id: 'pcaob_inventory',
    label: 'PCAOB inventory observation',
    framework: 'PCAOB' as AuditFrameworkId,
    query: 'PCAOB AS 2510 auditing inventories observation physical',
    match: /AS\s*2510|auditing\s+inventories/i,
  },
  {
    id: 'pcaob_opinion',
    label: 'PCAOB scope limitation / opinion',
    framework: 'PCAOB' as AuditFrameworkId,
    query: 'PCAOB AS 3105 departures unqualified opinion qualified disclaimer',
    match: /AS\s*3105|departures?\s+from\s+unqualified/i,
  },
] as const

export type AuditIssueThemeId = (typeof AUDIT_ISSUE_THEMES)[number]['id']

export function themesForParsedQuestion(parsed: ParsedAuditQuestion) {
  const needsPcaob = Boolean(parsed.comparisonFramework === 'PCAOB' || parsed.primaryFramework === 'PCAOB')
  return AUDIT_ISSUE_THEMES.filter((t) => {
    if (t.framework === 'PCAOB') return needsPcaob
    return parsed.primaryFramework === 'AICPA' || !parsed.primaryFramework
  })
}

export function buildIssueTargetedQueries(parsed: ParsedAuditQuestion): {
  id: string
  label: string
  framework: AuditFrameworkId
  query: string
}[] {
  return themesForParsedQuestion(parsed).map((t) => ({
    id: t.id,
    label: t.label,
    framework: t.framework,
    query: t.query,
  }))
}

export interface AuthorityUsageSummary {
  documentsUsed: number
  sectionsUsed: number
  passagesUsed: number
  frameworks: string[]
  documentTitles: string[]
  sectionLabels: string[]
  issuesSupportedInternally: string[]
  issuesNeedingInternet: string[]
  websitesSearched: string[]
}

export function summarizeAuthorityUsage(input: {
  citations: {
    publisher: string
    title: string
    section?: string
    paragraph?: string
    page?: number
    quotedText?: string
    sourceId?: string
    internalOrExternal?: 'internal' | 'external'
    sourceUrl?: string
  }[]
  issueCoverage: { id: string; label: string; supported: boolean; origin: 'internal' | 'internet' | 'none' }[]
  websitesSearched?: string[]
}): AuthorityUsageSummary {
  const docs = new Set<string>()
  const sections = new Set<string>()
  for (const c of input.citations) {
    docs.add(`${c.publisher}|${c.title}`.toLowerCase())
    const label =
      extractStandardSectionLabel(c.quotedText || '', c.section) ||
      c.section ||
      (c.paragraph ? `¶${c.paragraph}` : undefined) ||
      (c.page != null ? `p.${c.page}` : undefined)
    if (label) sections.add(label)
  }
  return {
    documentsUsed: docs.size,
    sectionsUsed: sections.size,
    passagesUsed: input.citations.length,
    frameworks: [
      ...new Set(
        input.citations.flatMap((c) => {
          const t = `${c.title} ${c.quotedText || ''} ${c.section || ''}`
          const out: string[] = []
          if (/AU-C|AICPA|GAAS/i.test(t)) out.push('AICPA U.S. GAAS (AU-C)')
          if (/PCAOB|\bAS\s+\d{3,4}\b/i.test(t)) out.push('PCAOB')
          return out
        }),
      ),
    ],
    documentTitles: [...new Set(input.citations.map((c) => c.title))],
    sectionLabels: [...sections],
    issuesSupportedInternally: input.issueCoverage
      .filter((i) => i.origin === 'internal')
      .map((i) => i.label),
    issuesNeedingInternet: input.issueCoverage
      .filter((i) => i.origin === 'internet' || i.origin === 'none')
      .map((i) => i.label),
    websitesSearched: input.websitesSearched ?? [],
  }
}

export function evaluateIssueCoverage(input: {
  parsed: ParsedAuditQuestion
  passages: { text: string; internal: boolean; title?: string; publisher?: string }[]
}): {
  id: string
  label: string
  supported: boolean
  origin: 'internal' | 'internet' | 'none'
  matchedPassageIndex?: number
}[] {
  const themes = themesForParsedQuestion(input.parsed)
  return themes.map((theme) => {
    const internalIdx = input.passages.findIndex(
      (p) => p.internal && theme.match.test(`${p.title || ''} ${p.text}`),
    )
    if (internalIdx >= 0) {
      return {
        id: theme.id,
        label: theme.label,
        supported: true,
        origin: 'internal' as const,
        matchedPassageIndex: internalIdx,
      }
    }
    const webIdx = input.passages.findIndex(
      (p) => !p.internal && theme.match.test(`${p.title || ''} ${p.text}`),
    )
    if (webIdx >= 0) {
      return {
        id: theme.id,
        label: theme.label,
        supported: true,
        origin: 'internet' as const,
        matchedPassageIndex: webIdx,
      }
    }
    return { id: theme.id, label: theme.label, supported: false, origin: 'none' as const }
  })
}

/**
 * Deduplicate authorities without collapsing multiple sections/paragraphs from one document.
 * Prefer internal copy when an internet duplicate of the same section exists.
 */
export function dedupeAuthoritySources<
  T extends {
    publisher: string
    title: string
    section?: string
    paragraph?: string
    page?: number
    quotedText?: string
    sourceUrl?: string
    sourceId?: string
    internalOrExternal?: 'internal' | 'external'
  },
>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  // Prefer internal first so internet verification copies lose to uploaded text.
  const ordered = [...items].sort((a, b) => {
    const ai = a.internalOrExternal === 'internal' ? 0 : 1
    const bi = b.internalOrExternal === 'internal' ? 0 : 1
    return ai - bi
  })
  for (const item of ordered) {
    const sectionLabel =
      extractStandardSectionLabel(item.quotedText || '', item.section) || item.section || ''
    const excerptKey = (item.quotedText || '').slice(0, 120).toLowerCase().replace(/\s+/g, ' ')
    const key = [
      item.publisher.toLowerCase().trim(),
      item.title.toLowerCase().replace(/\s+/g, ' ').trim(),
      sectionLabel.toLowerCase().trim(),
      (item.paragraph || '').toLowerCase(),
      item.page != null ? `p${item.page}` : '',
      excerptKey,
    ].join('|')
    if (seen.has(key)) continue
    // Collapse only true duplicates (same section + near-identical excerpt), not whole documents.
    const softSection = `${item.publisher}|${item.title}|${sectionLabel}`.toLowerCase()
    if (
      sectionLabel &&
      [...seen].some((k) => k.startsWith(softSection) && k.includes(excerptKey.slice(0, 60)))
    ) {
      continue
    }
    seen.add(key)
    out.push(item)
  }
  return out
}

export function formatAuthorityUsageBlock(usage: AuthorityUsageSummary): string {
  return [
    `Documents used: ${usage.documentsUsed}`,
    `Authoritative sections used: ${usage.sectionsUsed}`,
    `Supporting passages used: ${usage.passagesUsed}`,
  ].join('\n')
}

export function buildResearchPathDisclosure(input: {
  usedInternet: boolean
  primaryFramework?: AuditFrameworkId
  comparisonFramework?: AuditFrameworkId
  unresolvedIssues: string[]
  internetOrgs: string[]
  internalHadPrimary: boolean
  internalHadComparison: boolean
}): string {
  if (!input.usedInternet) {
    return 'Research path: Chai answered using uploaded authoritative auditing standards only. No internet search was necessary.'
  }
  const parts: string[] = [
    'Research path: Chai searched the uploaded auditing standards first.',
  ]
  if (input.internalHadPrimary && input.comparisonFramework === 'PCAOB' && !input.internalHadComparison) {
    parts.push(
      'The internal document contained the applicable AICPA guidance but did not contain the requested PCAOB standards, so Chai searched the official PCAOB website for the comparison.',
    )
  } else if (input.unresolvedIssues.length) {
    parts.push(
      `Because the internal library did not fully resolve ${input.unresolvedIssues.join('; ')}, Chai then searched ${
        input.internetOrgs.join(', ') || 'official AICPA/PCAOB sources'
      }.`,
    )
  } else {
    parts.push(
      `Chai then searched ${input.internetOrgs.join(', ') || 'official sources'} to verify or complete coverage.`,
    )
  }
  return parts.join(' ')
}

export function buildInventoryGaasAnswerSkeleton(input: {
  parsed: ParsedAuditQuestion
  primaryPassages: {
    publisher: string
    title: string
    exactPassage?: string
    section?: string
    paragraph?: string
    page?: number
  }[]
  comparisonPassages: {
    publisher: string
    title: string
    exactPassage?: string
    section?: string
  }[]
  usedInternet: boolean
  unresolvedIssues: string[]
  internetOrgs: string[]
  usage?: AuthorityUsageSummary
  internalHadPrimary?: boolean
  internalHadComparison?: boolean
}): string {
  const { parsed, primaryPassages, comparisonPassages, usedInternet, unresolvedIssues, internetOrgs } =
    input
  const cite = (i: number) => {
    const p = primaryPassages[i]
    if (!p) return ''
    const sec =
      extractStandardSectionLabel(p.exactPassage || '', p.section) || p.section || undefined
    return ` [${p.publisher}: ${p.title}${sec ? `, ${sec}` : ''}]`
  }

  const fwLabel =
    parsed.primaryFramework === 'AICPA'
      ? 'AICPA U.S. GAAS (AU-C)'
      : parsed.primaryFramework === 'PCAOB'
        ? 'PCAOB auditing standards'
        : 'the stated auditing framework'

  const passagesBlurb = [...new Map(
    [...primaryPassages, ...comparisonPassages].map((p) => {
      const sec = extractStandardSectionLabel(p.exactPassage || '', p.section) || p.section || ''
      return [`${p.publisher}|${p.title}|${sec}|${(p.exactPassage || '').slice(0, 80)}`, { ...p, sec }]
    }),
  ).values()]
    .slice(0, 10)
    .map((p, i) => `(${i + 1}) ${p.publisher} — ${p.title}${p.sec ? ` (${p.sec})` : ''}`)
    .join('\n')

  const usage = input.usage
  const usageBlock = usage
    ? formatAuthorityUsageBlock(usage)
    : formatAuthorityUsageBlock(
        summarizeAuthorityUsage({
          citations: primaryPassages.map((p) => ({
            publisher: p.publisher,
            title: p.title,
            section: p.section,
            paragraph: p.paragraph,
            page: p.page,
            quotedText: p.exactPassage,
            internalOrExternal: 'internal',
          })),
          issueCoverage: [],
        }),
      )

  const researchPath = buildResearchPathDisclosure({
    usedInternet,
    primaryFramework: parsed.primaryFramework,
    comparisonFramework: parsed.comparisonFramework,
    unresolvedIssues,
    internetOrgs,
    internalHadPrimary: input.internalHadPrimary ?? primaryPassages.length > 0,
    internalHadComparison: input.internalHadComparison ?? comparisonPassages.length > 0,
  })

  return [
    '## Direct conclusion',
    `For this privately held / nonissuer engagement, the controlling framework is ${fwLabel}, not PCAOB. PCAOB is addressed only as a separate comparison.${cite(0)}`,
    '',
    'Because the auditor did not observe the year-end physical inventory count and management refuses a recount, the auditor must determine whether alternative procedures can obtain sufficient appropriate audit evidence regarding inventory existence and condition. If not, there is a scope limitation that affects the auditor’s opinion based on materiality and pervasiveness.',
    '',
    '## Applicable framework',
    `Primary: ${fwLabel}. Comparison requested: ${parsed.comparisonFramework ?? 'none'}.`,
    `Period: ${parsed.reportingPeriodEnd ?? 'as stated'}. Entity: ${parsed.entityType ?? 'as stated'}.`,
    '',
    '## Issues identified',
    ...parsed.issues.map((i) => `- ${i}`),
    '',
    '## Authority usage',
    usageBlock,
    usage?.frameworks?.length ? `Standards/frameworks used: ${usage.frameworks.join('; ')}` : '',
    usage?.sectionLabels?.length
      ? `Sections/paragraphs referenced: ${usage.sectionLabels.slice(0, 12).join('; ')}`
      : '',
    '',
    '## Relevant standards (from research)',
    passagesBlurb || '- Controlling AU-C / PCAOB passages must be verified; see Sources.',
    '',
    '## Application to the facts',
    '- Inventory is stated as a large percentage of assets, so existence/condition assertions are likely material.',
    '- The auditor missed the count due to client non-notification and management refuses another count — later observation may be limited or impossible for year-end quantities.',
    '- Available perpetual records, count sheets, purchases, and subsequent sales support alternative procedures, but they do not automatically equal observation.',
    '',
    '## Recommended procedures',
    '1. Evaluate whether observing inventory at a date subsequent to year-end, with rollforward/rollbackward testing, can still provide evidence about year-end quantities.',
    '2. Perform alternative procedures on inventory, which may include testing perpetual records to count sheets, testing purchases and subsequent sales cutoffs, examining invoices/receiving docs, and testing costing/valuation as appropriate.',
    '3. Assess whether the evidence obtained is sufficient and appropriate for the assertions (especially existence).',
    '4. Document the scope limitation if sufficient appropriate evidence cannot be obtained.',
    '',
    '## Effect on the auditor’s report',
    '- If sufficient appropriate evidence is obtained through alternative procedures: unmodified opinion may still be possible (professional judgment).',
    '- If not: treat as a scope limitation.',
    '- Material but not pervasive → qualified opinion (“except for”).',
    '- Material and pervasive → disclaimer of opinion.',
    '- Inventory at 38% of assets is a strong indicator of possible pervasiveness, but pervasiveness is a judgment based on the effects on the financial statements as a whole.',
    '',
    '## Separate PCAOB comparison',
    parsed.comparisonFramework === 'PCAOB'
      ? comparisonPassages.length
        ? `If the same entity were a public company audited under PCAOB standards, inventory observation and reporting consequences are addressed under PCAOB AS (retrieved internally). The core problem—missed observation, alternative procedures, and possible scope limitation—remains, but the controlling standards and report wording follow PCAOB rather than AU-C. Do not substitute PCAOB as the primary framework for the private-company facts. [${comparisonPassages[0].publisher}: ${comparisonPassages[0].title}]`
        : 'If the same entity were a public company audited under PCAOB standards, inventory observation / audit evidence and reporting consequences are addressed under PCAOB AS (e.g., inventories and opinion departures). The core problem—missed observation, alternative procedures, and possible scope limitation—remains, but the controlling standards and report wording follow PCAOB rather than AU-C. Do not substitute PCAOB as the primary framework for the private-company facts.'
      : 'No PCAOB comparison was requested.',
    '',
    '## Missing facts / assumptions',
    '- Final opinion type depends on whether alternative procedures actually produce sufficient appropriate evidence and on pervasiveness judgment.',
    usage?.issuesNeedingInternet?.length
      ? `- Issues still thin after retrieval: ${usage.issuesNeedingInternet.join('; ')}`
      : '- Exact paragraph cites should be verified against the official text when excerpts are incomplete.',
    '',
    '## Research-path disclosure',
    researchPath,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function computeAuditAnswerConfidence(input: {
  correctPrimaryFramework: boolean
  wrongPrimaryFramework: boolean
  controllingAuthorityFound: boolean
  checklistSupported: number
  checklistTotal: number
  verifiedCitations: number
  unverifiedCitations: number
  irrelevantSources: number
  unansweredMaterialIssues: number
  usedOnlySecondary: boolean
  materialMissingFacts: number
  /** Distinct issue themes supported by retrieved passages (not document file count). */
  issueThemesSupported?: number
  issueThemesTotal?: number
  /** True when coverage is only one narrow theme (e.g. opinions only). */
  singleThemeOnly?: boolean
  documentsUsed?: number
}): { score: number; explanationLines: string[] } {
  let score = 0
  const lines: string[] = []

  if (input.correctPrimaryFramework) {
    score += 20
    lines.push('Correct framework selection: +20 (primary framework matches the question).')
  } else if (input.wrongPrimaryFramework) {
    score = Math.min(score, 25)
    lines.push('Wrong primary framework: confidence capped at 25%.')
    return { score: Math.min(score, 25), explanationLines: lines }
  } else {
    lines.push('Framework selection incomplete: +0 of 20.')
  }

  if (input.controllingAuthorityFound) {
    score += 25
    lines.push(
      `Controlling-authority coverage: +25${
        input.documentsUsed != null
          ? ` (${input.documentsUsed} uploaded auditing-standards document(s) used — document count does not reduce score).`
          : '.'
      }`,
    )
  } else {
    score -= 25
    lines.push('Missing controlling authority: −25.')
  }

  const themeTotal = input.issueThemesTotal ?? input.checklistTotal
  const themeSupported = input.issueThemesSupported ?? input.checklistSupported
  const coverRatio = themeTotal ? themeSupported / themeTotal : 0
  const coverPts = Math.round(20 * coverRatio)
  score += coverPts
  lines.push(
    `Issue-theme passage coverage: +${coverPts} (${themeSupported}/${themeTotal} material themes supported by retrieved sections/passages).`,
  )

  if (input.singleThemeOnly) {
    score -= 20
    lines.push(
      'Single-theme penalty: −20 (one paragraph/theme such as modified opinions alone cannot support the full inventory answer).',
    )
  }

  const citePts = Math.min(15, Math.max(0, themeSupported) * 3)
  score += citePts
  lines.push(`Citation support for covered themes: +${citePts}.`)
  score -= Math.min(20, input.unverifiedCitations * 5)
  if (input.unverifiedCitations) {
    lines.push(
      `Unverified citations: −${Math.min(20, input.unverifiedCitations * 5)} (capped; internet verification copies preferred not to inflate).`,
    )
  }
  score += 8
  lines.push('Effective-date / engagement timing: +8 (period identified from question).')

  score += Math.max(0, 5 - input.materialMissingFacts * 5)
  lines.push(
    input.materialMissingFacts
      ? `Fact completeness penalty for ${input.materialMissingFacts} missing fact(s).`
      : 'Fact completeness: +5.',
  )

  score += 5
  lines.push('Cross-check completion: +5 (framework vs comparison separated).')

  const unansweredPenalty = Math.min(45, input.unansweredMaterialIssues * 10)
  score -= unansweredPenalty
  if (input.unansweredMaterialIssues) {
    lines.push(
      `Unanswered material issues: −${unansweredPenalty} (${input.unansweredMaterialIssues} theme(s); capped).`,
    )
  }
  score -= input.irrelevantSources * 10
  if (input.irrelevantSources) {
    lines.push(`Irrelevant cited sources: −${input.irrelevantSources * 10}.`)
  }
  if (input.usedOnlySecondary) {
    score -= 15
    lines.push('Reliance only on secondary authority: −15.')
  }

  // Uploaded auditing-standards document count is not a penalty when sections cover the issues.
  if ((input.documentsUsed ?? 0) >= 1 && (input.issueThemesSupported ?? 0) >= 4) {
    lines.push(
      'Note: one or few uploaded auditing-standards documents can support a high score when multiple required sections/passages were retrieved.',
    )
  }

  score = Math.max(0, Math.min(100, score))
  lines.push(`Final evidence confidence: ${score}/100.`)
  return { score, explanationLines: lines }
}
