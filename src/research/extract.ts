import type {
  AccountingIssue,
  FactExtractionResult,
  MissingInformationItem,
  ResearchContext,
} from './schemas.ts'

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

/** Deterministic fact extraction — does not rewrite material facts. */
export function extractFactsFromQuestion(question: string): FactExtractionResult {
  const amounts = question.match(/\$[\d,]+(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g) ?? []
  const dates =
    question.match(/\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b|\b20\d{2}\b/gi) ??
    []
  const entities: string[] = []
  if (/\b(s[- ]?corp|c[- ]?corp|partnership|llc|trust|estate|nonprofit|individual)\b/i.test(question)) {
    const m = question.match(/\b(s[- ]?corp|c[- ]?corp|partnership|llc|trust|estate|nonprofit|individual)\b/i)
    if (m) entities.push(m[1])
  }

  const requestedOutput: string[] = []
  if (/journal|debit|credit/i.test(question)) requestedOutput.push('journal_entry')
  if (/depreciat|macrs|expense/i.test(question)) requestedOutput.push('calculation')
  if (/cite|authority|guidance|what does/i.test(question)) requestedOutput.push('authority_citation')
  if (/explain|study|why/i.test(question)) requestedOutput.push('explanation')

  const ambiguities: string[] = []
  if (/book|tax/i.test(question) && !/book and tax|book vs tax|both/i.test(question)) {
    if (/\bbook\b/i.test(question) && /\btax\b/i.test(question)) {
      ambiguities.push('Both book and tax terms appear — confirm whether book, tax, or both are in scope.')
    }
  }

  const potentiallyMissing: MissingInformationItem[] = []
  if (/depreciat|macrs|§\s?179|bonus/i.test(question)) {
    if (!/cost|\$|purchase/i.test(question)) {
      potentiallyMissing.push({
        field: 'cost',
        reason: 'Asset cost is typically required for depreciation.',
        material: true,
      })
    }
    if (!/placed in service|pis|\d{4}-\d{2}-\d{2}/i.test(question)) {
      potentiallyMissing.push({
        field: 'placedInServiceDate',
        reason: 'Placed-in-service date drives convention and first-year amounts.',
        material: true,
      })
    }
  }

  const facts: string[] = []
  for (const a of amounts) facts.push(`Amount mentioned: ${a}`)
  for (const d of dates) facts.push(`Date/year mentioned: ${d}`)

  return {
    originalQuestion: question,
    userProvidedFacts: facts,
    monetaryAmounts: amounts,
    dates,
    entities,
    transactions: /purchase|sale|lease|distribution|contribution/i.test(question)
      ? ['Transaction language detected in question']
      : [],
    documentsProvided: [],
    requestedOutput,
    potentialAmbiguities: ambiguities,
    potentiallyMissingFacts: potentiallyMissing,
  }
}

export function classifyIssuesDeterministic(question: string): AccountingIssue[] {
  const q = question.toLowerCase()
  const issues: AccountingIssue[] = []

  const push = (partial: Omit<AccountingIssue, 'issueId'>) => {
    issues.push({ ...partial, issueId: uid('issue') })
  }

  if (/depreciat|macrs|§\s?168|section 179|bonus/.test(q)) {
    push({
      title: 'Depreciation / cost recovery',
      category: 'Depreciation',
      description: 'Question involves depreciation, MACRS, or cost recovery.',
      priority: 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: /\$|\d{4,}|compute|calculate|expense/.test(q),
      requiresJournalEntry: /journal|debit|credit|entry/.test(q),
      missingFacts: [],
      whyItMatters: 'Depreciation rules differ for book vs tax and by year/convention.',
    })
  }
  if (/lease|asc 842|finance lease|operating lease/.test(q)) {
    push({
      title: 'Lease classification / measurement',
      category: 'Leases',
      description: 'Question involves lease accounting.',
      priority: issues.length ? 'secondary' : 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: false,
      requiresJournalEntry: /journal|entry/.test(q),
      missingFacts: [],
      whyItMatters: 'Lease classification drives balance-sheet presentation and expense pattern.',
    })
  }
  if (/revenue|asc 606|performance obligation/.test(q)) {
    push({
      title: 'Revenue recognition',
      category: 'Revenue recognition',
      description: 'Question involves revenue recognition.',
      priority: issues.length ? 'secondary' : 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: false,
      requiresJournalEntry: false,
      missingFacts: [],
      whyItMatters: 'Timing of revenue affects financial statements and tax book differences.',
    })
  }
  if (/audit|pcaob|confirmation|assertion|sampling/.test(q)) {
    push({
      title: 'Audit / assurance issue',
      category: 'Audit',
      description: 'Question involves auditing standards or procedures.',
      priority: issues.length ? 'secondary' : 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: false,
      requiresJournalEntry: false,
      missingFacts: [],
      whyItMatters: 'Applicable audit framework (PCAOB vs AICPA) changes the authoritative standards.',
    })
  }
  if (/basis|s[- ]?corp|partner|distribution|pass[- ]through/.test(q)) {
    push({
      title: 'Basis / pass-through taxation',
      category: 'Basis',
      description: 'Question involves basis or pass-through taxation.',
      priority: issues.length ? 'secondary' : 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: /\$|\d/.test(q),
      requiresJournalEntry: false,
      missingFacts: [],
      whyItMatters: 'Basis ordering and adjustments control loss allowance and distribution taxation.',
    })
  }
  if (/tax|irs|irc|§/.test(q) && !issues.some((i) => /tax|Depreciation|Basis/i.test(i.category))) {
    push({
      title: 'Federal tax research',
      category: 'Federal tax',
      description: 'Question appears to require federal tax authority.',
      priority: issues.length ? 'secondary' : 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: false,
      requiresJournalEntry: false,
      missingFacts: [],
      whyItMatters: 'Tax conclusions require applicable-year primary authority.',
    })
  }
  if (/gaap|asc|ifrs|financial statement|ppe|capitaliz/.test(q) && !issues.some((i) => i.category === 'Leases')) {
    if (!issues.some((i) => /Financial|Lease|Revenue|Depreciation/i.test(i.category))) {
      push({
        title: 'Financial accounting',
        category: 'Financial accounting',
        description: 'Question appears to require financial accounting guidance.',
        priority: issues.length ? 'secondary' : 'primary',
        requiresAuthorityResearch: true,
        requiresCalculation: false,
        requiresJournalEntry: /journal|entry/.test(q),
        missingFacts: [],
        whyItMatters: 'Book conclusions must cite applicable framework authority (e.g., US GAAP).',
      })
    }
  }

  if (!issues.length) {
    push({
      title: 'General accounting question',
      category: 'Bookkeeping',
      description: 'Could not confidently classify a narrow issue from keywords alone.',
      priority: 'primary',
      requiresAuthorityResearch: true,
      requiresCalculation: false,
      requiresJournalEntry: false,
      missingFacts: [
        {
          field: 'issueClarification',
          reason: 'Please clarify the accounting issue if the classification looks wrong.',
          material: false,
        },
      ],
      whyItMatters: 'Issue identification drives which authority set is searched.',
    })
  }

  if (issues.length && !issues.some((i) => i.priority === 'primary')) {
    issues[0].priority = 'primary'
  }
  return issues
}

/**
 * Build research context WITHOUT silent defaults for material fields.
 * Missing year/jurisdiction/framework blocks when those fields matter.
 */
export function buildResearchContext(
  question: string,
  issues: AccountingIssue[],
): ResearchContext {
  const q = question.toLowerCase()
  const missing: MissingInformationItem[] = []
  const assumptions: ResearchContext['assumptions'] = []

  const taxRelated = issues.some((i) =>
    /tax|Depreciation|Basis|Federal tax|Payroll|Partnership|Corporate|Individual/i.test(i.category),
  )
  const gaapRelated = issues.some((i) =>
    /Financial|Lease|Revenue|Consolidat|presentation/i.test(i.category),
  )
  const auditRelated = issues.some((i) => /Audit/i.test(i.category))

  let country: string | undefined
  if (/\bunited states\b|\bu\.?s\.?\b|\bus[- ]federal\b|\bfederal\b|\birs\b/.test(q)) {
    country = 'US'
  }

  let jurisdiction: string | undefined
  if (/us[- ]?federal|federal|irs|irc/.test(q)) jurisdiction = 'US-federal'
  else if (/\b(state of|california|texas|new york|florida)\b/.test(q)) {
    const m = q.match(/\b(california|texas|new york|florida)\b/)
    jurisdiction = m ? `US-${m[1]}` : undefined
  }

  const yearMatch = q.match(/\b(20\d{2})\b/)
  const taxYear = yearMatch ? Number(yearMatch[1]) : undefined

  let accountingFramework: ResearchContext['accountingFramework'] | undefined
  if (/us[- ]?gaap|gaap|asc/.test(q)) accountingFramework = 'US_GAAP'
  else if (/ifrs/.test(q)) accountingFramework = 'IFRS'
  else if (/tax|macrs|irs|irc/.test(q) && taxRelated) accountingFramework = 'TAX'

  let auditFramework: ResearchContext['auditFramework'] | undefined
  if (/pcaob/.test(q)) auditFramework = 'PCAOB'
  else if (/aicpa/.test(q)) auditFramework = 'AICPA'
  else if (/gagas|yellow book/.test(q)) auditFramework = 'GAGAS'

  let bookOrTax: ResearchContext['bookOrTax'] | undefined
  if (/book and tax|book vs tax|book versus tax/.test(q)) bookOrTax = 'both'
  else if (/\btax\b/.test(q) && !/\bbook\b/.test(q)) bookOrTax = 'tax'
  else if (/\bbook\b/.test(q) && !/\btax\b/.test(q)) bookOrTax = 'book'

  let entityType: string | undefined
  const ent = q.match(/\b(s[- ]?corporation|s[- ]?corp|c[- ]?corporation|c[- ]?corp|partnership|llc|trust|estate|nonprofit|individual)\b/i)
  if (ent) entityType = ent[1]

  // Material missing — do NOT invent defaults
  if (taxRelated && taxYear == null) {
    missing.push({
      field: 'taxYear',
      reason: 'Applicable tax year is material and was not provided. Chai will not assume the current year.',
      material: true,
    })
  }
  if (taxRelated && !jurisdiction) {
    missing.push({
      field: 'jurisdiction',
      reason: 'Federal vs state jurisdiction is material and was not provided. Chai will not assume US-federal.',
      material: true,
    })
  }
  if (gaapRelated && !accountingFramework) {
    missing.push({
      field: 'accountingFramework',
      reason: 'Accounting framework (e.g., US GAAP vs IFRS) is material and was not provided.',
      material: true,
    })
  }
  if (auditRelated && !auditFramework) {
    missing.push({
      field: 'auditFramework',
      reason: 'Audit framework (PCAOB vs AICPA vs GAGAS) is material and was not provided.',
      material: true,
    })
  }
  if (!country && (taxRelated || gaapRelated || auditRelated)) {
    missing.push({
      field: 'country',
      reason: 'Country was not stated. Chai will not assume United States.',
      material: true,
    })
  }

  return {
    country,
    jurisdiction,
    taxYear,
    accountingFramework,
    auditFramework,
    entityType,
    bookOrTax,
    missingMaterialFacts: missing,
    assumptions,
  }
}

export function validateCitationCoverage(
  conclusions: { conclusionId: string; statement: string; supportingPassageIds: string[]; cited: boolean }[],
): {
  totalConclusions: number
  citedConclusions: number
  uncitedConclusions: string[]
  passed: boolean
  summary: string
} {
  const uncited = conclusions.filter((c) => !c.cited || c.supportingPassageIds.length === 0)
  const cited = conclusions.length - uncited.length
  const passed = conclusions.length === 0 ? false : uncited.length === 0
  return {
    totalConclusions: conclusions.length,
    citedConclusions: cited,
    uncitedConclusions: uncited.map((c) => c.conclusionId),
    passed,
    summary: passed
      ? `All ${conclusions.length} material conclusion(s) are cited.`
      : `${uncited.length} of ${conclusions.length} material conclusion(s) lack citation coverage.`,
  }
}
