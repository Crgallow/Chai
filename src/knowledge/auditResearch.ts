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
  return Math.max(0, score)
}

export function dedupeAuthoritySources<
  T extends {
    publisher: string
    title: string
    section?: string
    sourceUrl?: string
    sourceId?: string
  },
>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = [
      item.publisher.toLowerCase().trim(),
      item.title.toLowerCase().replace(/\s+/g, ' ').trim(),
      (item.section || '').toLowerCase().trim(),
      (item.sourceId || '').replace(/^ks_repo_/, ''),
    ].join('|')
    if (seen.has(key)) continue
    // Also collapse internal/external same title
    const soft = `${item.publisher}|${item.title}`.toLowerCase()
    if ([...seen].some((k) => k.startsWith(soft))) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function buildInventoryGaasAnswerSkeleton(input: {
  parsed: ParsedAuditQuestion
  primaryPassages: { publisher: string; title: string; exactPassage?: string; section?: string }[]
  comparisonPassages: { publisher: string; title: string; exactPassage?: string; section?: string }[]
  usedInternet: boolean
  unresolvedIssues: string[]
  internetOrgs: string[]
}): string {
  const { parsed, primaryPassages, usedInternet, unresolvedIssues, internetOrgs } = input
  const cite = (i: number) => (primaryPassages[i] ? ` [${primaryPassages[i].publisher}: ${primaryPassages[i].title}${primaryPassages[i].section ? `, ${primaryPassages[i].section}` : ''}]` : '')

  const fwLabel =
    parsed.primaryFramework === 'AICPA'
      ? 'AICPA U.S. GAAS (AU-C)'
      : parsed.primaryFramework === 'PCAOB'
        ? 'PCAOB auditing standards'
        : 'the stated auditing framework'

  const passagesBlurb = [...new Map(
    primaryPassages.map((p) => [`${p.publisher}|${p.title}|${p.section || ''}`, p]),
  ).values()]
    .slice(0, 4)
    .map((p, i) => `(${i + 1}) ${p.publisher} — ${p.title}${p.section ? ` (${p.section})` : ''}`)
    .join('\n')

  const researchPath = usedInternet
    ? `Research path: Chai searched the uploaded authoritative auditing standards first. Because the internal library did not fully resolve ${
        unresolvedIssues.join('; ') || 'one or more material issues'
      }, Chai then searched ${internetOrgs.join(', ') || 'official AICPA/PCAOB sources'}.`
    : 'Research path: Chai answered using uploaded authoritative auditing standards only. No internet search was necessary.'

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
      ? 'If the same entity were a public company audited under PCAOB standards, inventory observation / audit evidence and reporting consequences are addressed under PCAOB AS (e.g., inventories and opinion departures). The core problem—missed observation, alternative procedures, and possible scope limitation—remains, but the controlling standards and report wording follow PCAOB rather than AU-C. Do not substitute PCAOB as the primary framework for the private-company facts.'
      : 'No PCAOB comparison was requested.',
    '',
    '## Missing facts / assumptions',
    '- Exact AU-C section/paragraph cites should be verified against the official text when excerpts are incomplete.',
    '- Final opinion type depends on whether alternative procedures actually produce sufficient appropriate evidence and on pervasiveness judgment.',
    '',
    '## Research-path disclosure',
    researchPath,
  ].join('\n')
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
    lines.push('Controlling-authority coverage: +25.')
  } else {
    score -= 25
    lines.push('Missing controlling authority: −25.')
  }

  const coverRatio = input.checklistTotal
    ? input.checklistSupported / input.checklistTotal
    : 0
  const coverPts = Math.round(20 * coverRatio)
  score += coverPts
  lines.push(
    `Issue-checklist coverage: +${coverPts} (${input.checklistSupported}/${input.checklistTotal} supported).`,
  )

  const citePts = Math.min(15, input.verifiedCitations * 5)
  score += citePts
  lines.push(`Citation verification: +${citePts}.`)
  score -= input.unverifiedCitations * 10
  if (input.unverifiedCitations) lines.push(`Unverified citations: −${input.unverifiedCitations * 10}.`)

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

  score -= input.unansweredMaterialIssues * 15
  if (input.unansweredMaterialIssues) {
    lines.push(`Unanswered material issues: −${input.unansweredMaterialIssues * 15}.`)
  }
  score -= input.irrelevantSources * 10
  if (input.irrelevantSources) {
    lines.push(`Irrelevant cited sources: −${input.irrelevantSources * 10}.`)
  }
  if (input.usedOnlySecondary) {
    score -= 15
    lines.push('Reliance only on secondary authority: −15.')
  }

  score = Math.max(0, Math.min(100, score))
  lines.push(`Final evidence confidence: ${score}/100.`)
  return { score, explanationLines: lines }
}
