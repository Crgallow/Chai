import { getAllowlist, listExternalCandidates, saveExternalCandidates, uid } from '../store/jsonStore.ts'
import type { AccountingCitation, ExternalCandidate } from '../schemas.ts'

export interface OfficialResearchRequest {
  query: string
  taxYear?: number
  jurisdiction?: string
  category?: string
  organizationId?: string
}

export interface OfficialResearchResult {
  title: string
  publisher: string
  url: string
  retrievedAt: string
  applicableYear?: number
  quotedSection: string
  domain: string
  allowlisted: boolean
  demoData: boolean
}

export interface OfficialSourceResearchProvider {
  search(request: OfficialResearchRequest): Promise<OfficialResearchResult[]>
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Safe mock — not live web search. Labeled demo data. */
export class MockOfficialSourceResearchProvider implements OfficialSourceResearchProvider {
  async search(request: OfficialResearchRequest): Promise<OfficialResearchResult[]> {
    const allow = await getAllowlist()
    const enabled = new Set(allow.filter((a) => a.enabled).map((a) => a.domain))
    const q = request.query.toLowerCase()
    const now = new Date().toISOString()

    const catalog: OfficialResearchResult[] = [
      {
        title: 'Publication 946 — How To Depreciate Property (demo excerpt)',
        publisher: 'IRS',
        url: 'https://www.irs.gov/publications/p946',
        retrievedAt: now,
        applicableYear: request.taxYear ?? 2025,
        quotedSection:
          'DEMO: Under MACRS, most tangible property placed in service after 1986 is recovered using the General Depreciation System and an applicable convention such as the half-year convention.',
        domain: 'irs.gov',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'ASC 360-10 PP&E depreciation concepts (demo summary)',
        publisher: 'FASB',
        url: 'https://www.fasb.org/',
        retrievedAt: now,
        quotedSection:
          'DEMO: The depreciable base of PP&E is generally cost less residual value, allocated systematically over useful life. Book methods are distinct from tax MACRS.',
        domain: 'fasb.org',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'PCAOB auditing standard overview (demo)',
        publisher: 'PCAOB',
        url: 'https://pcaobus.org/',
        retrievedAt: now,
        quotedSection: 'DEMO: PCAOB standards apply to audits of issuers; they are not interchangeable with AICPA standards for nonissuers.',
        domain: 'pcaobus.org',
        allowlisted: true,
        demoData: true,
      },
    ]

    const filtered = catalog.filter((item) => {
      if (!enabled.has(item.domain) && ![...enabled].some((d) => item.domain.endsWith(d))) return false
      if (/pcaob|issuer/.test(q) && item.domain === 'pcaobus.org') return true
      if (/depreciat|macrs|946/.test(q) && item.domain === 'irs.gov') return true
      if (/gaap|ppe|book/.test(q) && item.domain === 'fasb.org') return true
      if (/depreciat|tax|macrs|gaap|audit/.test(q)) return item.domain === 'irs.gov' || item.domain === 'fasb.org'
      return false
    })

    return filtered.map((item) => ({
      ...item,
      allowlisted: true,
      domain: domainOf(item.url) || item.domain,
    }))
  }
}

export async function assertAllowlistedUrl(url: string): Promise<boolean> {
  const allow = await getAllowlist()
  const host = domainOf(url)
  return allow.some((a) => a.enabled && (host === a.domain || host.endsWith(`.${a.domain}`)))
}

export async function queueExternalForReview(
  result: OfficialResearchResult,
  organizationId?: string,
): Promise<ExternalCandidate> {
  const candidate: ExternalCandidate = {
    id: uid('ext'),
    title: result.title,
    publisher: result.publisher,
    url: result.url,
    retrievedAt: result.retrievedAt,
    applicableYear: result.applicableYear,
    quotedSection: result.quotedSection,
    status: 'pending_review',
    organizationId,
  }
  const all = await listExternalCandidates()
  all.push(candidate)
  await saveExternalCandidates(all)
  return candidate
}

export function officialToCitation(result: OfficialResearchResult): AccountingCitation {
  return {
    publisher: result.publisher,
    title: result.title,
    sourceType: 'regulatory',
    authorityLevel: 'official_guidance',
    quotedText: result.quotedSection,
    sourceUrl: result.url,
    applicableYear: result.applicableYear,
    retrievedAt: result.retrievedAt,
    internalOrExternal: 'external',
    verified: false,
    demoData: result.demoData,
  }
}
