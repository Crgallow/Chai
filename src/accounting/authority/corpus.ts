export interface AuthorityDoc {
  id: string
  title: string
  source: string
  url?: string
  tags: string[]
  excerpt: string
}

/**
 * Curated local corpus only. The agent may cite these IDs — never invent others.
 */
export const AUTHORITY_CORPUS: AuthorityDoc[] = [
  {
    id: 'IRS-PUB-946',
    title: 'How To Depreciate Property (Publication 946)',
    source: 'IRS',
    url: 'https://www.irs.gov/publications/p946',
    tags: ['tax', 'macrs', 'depreciation', 'irs'],
    excerpt:
      'Publication 946 explains how to recover the cost of business or income-producing property through depreciation under MACRS, including recovery periods, conventions (half-year, mid-quarter, mid-month), and percentage tables in the appendix.',
  },
  {
    id: 'IRS-MACRS-A1-HY',
    title: 'MACRS Percentage Table A-1 — GDS Half-Year Convention',
    source: 'IRS Pub 946 Appendix A',
    url: 'https://www.irs.gov/publications/p946',
    tags: ['tax', 'macrs', 'half-year', 'table'],
    excerpt:
      'Table A-1 provides the depreciation rates for property depreciated using the General Depreciation System (GDS) and the half-year convention. Apply the listed percentage to the unadjusted depreciable basis for each recovery year.',
  },
  {
    id: 'IRS-MACRS-MQ',
    title: 'MACRS Mid-Quarter Convention Tables A-2–A-5',
    source: 'IRS Pub 946 Appendix A',
    url: 'https://www.irs.gov/publications/p946',
    tags: ['tax', 'macrs', 'mid-quarter', 'table'],
    excerpt:
      'If more than 40% of the total depreciable basis of property is placed in service during the last three months of the tax year, the mid-quarter convention generally applies. Tables A-2 through A-5 provide percentages by quarter placed in service.',
  },
  {
    id: 'IRS-MACRS-5YR',
    title: '5-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '5-year', 'computers'],
    excerpt:
      'Five-year property includes automobiles, computers and peripheral equipment, and office machinery. Under GDS half-year convention, recovery year 1 is typically 20.00% of unadjusted basis (before considering §179 or bonus).',
  },
  {
    id: 'IRS-MACRS-3YR',
    title: '3-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '3-year'],
    excerpt:
      'Three-year property includes certain race horses and qualified rent-to-own property. Under GDS half-year, year-1 rate is 33.33%.',
  },
  {
    id: 'IRS-MACRS-7YR',
    title: '7-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '7-year', 'office furniture'],
    excerpt:
      'Seven-year property includes office furniture and fixtures and certain other property. Under GDS half-year, year-1 rate is 14.29%.',
  },
  {
    id: 'IRS-MACRS-10YR',
    title: '10-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '10-year'],
    excerpt: 'Ten-year property includes vessels, barges, tugs, and similar equipment. GDS half-year year-1 rate is 10.00%.',
  },
  {
    id: 'IRS-MACRS-15YR',
    title: '15-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '15-year'],
    excerpt:
      'Fifteen-year property includes certain land improvements and qualified improvement property in applicable years. GDS typically uses 150% declining balance switching to straight line; half-year year-1 rate is 5.00%.',
  },
  {
    id: 'IRS-MACRS-20YR',
    title: '20-Year Property — MACRS Recovery Period',
    source: 'IRS Pub 946',
    tags: ['tax', 'macrs', '20-year'],
    excerpt: 'Twenty-year property includes certain farm buildings and municipal sewers. GDS half-year year-1 rate is 3.750%.',
  },
  {
    id: 'ASC-360-10-PPE',
    title: 'ASC 360-10 Property, Plant, and Equipment — Depreciation Concepts',
    source: 'FASB Accounting Standards Codification (summary for MVP)',
    tags: ['book', 'gaap', 'fasb', 'ppe'],
    excerpt:
      'Under US GAAP, the depreciable base of PP&E is generally cost less estimated residual/salvage value, allocated systematically over the asset’s useful life. Book depreciation methods (e.g., straight-line) are accounting policy choices distinct from tax MACRS.',
  },
  {
    id: 'BOOK-SL-CONVENTION',
    title: 'Book depreciation conventions (policy)',
    source: 'Common practice / company policy',
    tags: ['book', 'convention', 'policy'],
    excerpt:
      'Entities often adopt a half-year or full-month convention for book depreciation for administrative convenience. Confirm the company’s stated policy in its accounting manual before applying a convention.',
  },
  {
    id: 'ASC-740-TEMP-DIFF-HINT',
    title: 'ASC 740 — Temporary differences (informational)',
    source: 'FASB ASC 740 (high-level MVP note)',
    tags: ['book', 'tax', 'deferred tax', 'asc740'],
    excerpt:
      'Differences between book and tax depreciation of the same asset typically create temporary differences that may give rise to deferred tax assets or liabilities. A complete ASC 740 measurement requires enacted rates, valuation allowance analysis, and intraperiod allocation — beyond this MVP hint.',
  },
]

export function lookupAuthority(query: string, limit = 5): AuthorityDoc[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
  if (tokens.length === 0) return AUTHORITY_CORPUS.slice(0, limit)

  const scored = AUTHORITY_CORPUS.map((doc) => {
    const hay = `${doc.id} ${doc.title} ${doc.source} ${doc.tags.join(' ')} ${doc.excerpt}`.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) score += 1
      if (doc.id.toLowerCase() === t || doc.tags.includes(t)) score += 2
    }
    return { doc, score }
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return (scored.length ? scored.map((s) => s.doc) : AUTHORITY_CORPUS).slice(0, limit)
}

export function getAuthorityByIds(ids: string[]): AuthorityDoc[] {
  const set = new Set(ids)
  return AUTHORITY_CORPUS.filter((d) => set.has(d.id))
}
