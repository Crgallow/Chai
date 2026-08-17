import OpenAI from 'openai'
import { getAllowlist, listExternalCandidates, saveExternalCandidates, uid } from '../store/jsonStore.ts'
import type { AccountingCitation, ExternalCandidate } from '../schemas.ts'

export interface OfficialResearchRequest {
  query: string
  taxYear?: number
  jurisdiction?: string
  category?: string
  organizationId?: string
  preferredDomains?: string[]
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

function extractOutputText(response: unknown): string {
  const r = response as {
    output_text?: string
    output?: { type?: string; content?: { type?: string; text?: string }[] }[]
  }
  if (r.output_text) return r.output_text
  if (!Array.isArray(r.output)) return ''
  const parts: string[] = []
  for (const item of r.output) {
    for (const c of item.content ?? []) {
      if (c.text) parts.push(c.text)
    }
  }
  return parts.join('\n')
}

function extractUrlCitations(response: unknown): { url: string; title?: string }[] {
  const found: { url: string; title?: string }[] = []
  const seen = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n)
      return
    }
    const obj = node as Record<string, unknown>
    if (typeof obj.url === 'string' && /^https?:/i.test(obj.url) && !seen.has(obj.url)) {
      seen.add(obj.url)
      found.push({
        url: obj.url,
        title: typeof obj.title === 'string' ? obj.title : undefined,
      })
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(response)
  return found
}

/** Live OpenAI Responses web search — results are unverified external research. */
export class OpenAIWebResearchProvider implements OfficialSourceResearchProvider {
  async search(request: OfficialResearchRequest): Promise<OfficialResearchResult[]> {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for web research fallback.')
    }
    const client = new OpenAI({ apiKey })
    const model = process.env.OPENAI_RESEARCH_MODEL?.trim() || 'gpt-4o-mini'
    const preferred = request.preferredDomains?.length
      ? ` Prefer and prioritize these official domains: ${request.preferredDomains.join(', ')}. Use site-restricted search when possible.`
      : ''
    const year = request.taxYear ? ` Tax year context: ${request.taxYear}.` : ''
    const jur = request.jurisdiction ? ` Jurisdiction: ${request.jurisdiction}.` : ''

    const response = await client.responses.create({
      model,
      store: false,
      tools: [{ type: 'web_search_preview' as const }],
      instructions:
        'You are researching an accounting/tax/audit question for Chai. ' +
        'Use web search. Prefer IRS, SEC, PCAOB, FASB, AICPA, and other official sources when available. ' +
        'For AICPA U.S. GAAS questions, prioritize aicpa-cima.com AU-C materials. ' +
        'For PCAOB questions, prioritize pcaobus.org auditing standards. ' +
        'Do NOT cite unrelated United States Code titles for professional auditing-standards procedure questions. ' +
        'Return a concise factual briefing with short quoted excerpts and clear source titles/URLs. ' +
        'Do not invent citations. Label uncertainty.' +
        preferred,
      input: `${request.query}${year}${jur}`,
    })

    const text = extractOutputText(response).trim()
    const urls = extractUrlCitations(response)
    const now = new Date().toISOString()
    const allow = await getAllowlist()
    const enabled = allow.filter((a) => a.enabled).map((a) => a.domain)

    if (!text && !urls.length) return []

    if (urls.length) {
      return urls.slice(0, 5).map((u, i) => {
        const domain = domainOf(u.url)
        const allowlisted = enabled.some((d) => domain === d || domain.endsWith(`.${d}`))
        return {
          title: u.title || `Web research result ${i + 1}`,
          publisher: domain || 'Web',
          url: u.url,
          retrievedAt: now,
          applicableYear: request.taxYear,
          quotedSection: text.slice(i * 400, i * 400 + 500) || text.slice(0, 500),
          domain,
          allowlisted,
          demoData: false,
        }
      })
    }

    return [
      {
        title: 'Web research briefing',
        publisher: 'OpenAI web search',
        url: 'https://chatgpt.com/',
        retrievedAt: now,
        applicableYear: request.taxYear,
        quotedSection: text.slice(0, 1200),
        domain: 'openai.com',
        allowlisted: false,
        demoData: false,
      },
    ]
  }
}

/** Test-only mock — not used in production chat path. */
export class MockOfficialSourceResearchProvider implements OfficialSourceResearchProvider {
  async search(request: OfficialResearchRequest): Promise<OfficialResearchResult[]> {
    const allow = await getAllowlist()
    const enabled = new Set(allow.filter((a) => a.enabled).map((a) => a.domain))
    const q = request.query.toLowerCase()
    const now = new Date().toISOString()

    const catalog: OfficialResearchResult[] = [
      {
        title: 'AU-C Section 501 — Audit Evidence—Specific Considerations for Selected Items (inventory)',
        publisher: 'AICPA',
        url: 'https://www.aicpa-cima.com/',
        retrievedAt: now,
        applicableYear: request.taxYear ?? 2025,
        quotedSection:
          'TEST: When inventory is material, the auditor should obtain sufficient appropriate audit evidence regarding existence and condition, ordinarily by attendance at physical inventory counting unless impracticable. If attendance is impracticable, alternative audit procedures should be performed. If the auditor is unable to obtain sufficient appropriate audit evidence, the auditor should consider the effect on the opinion.',
        domain: 'aicpa-cima.com',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'AU-C Section 705 — Modifications to the Opinion in the Independent Auditor’s Report',
        publisher: 'AICPA',
        url: 'https://www.aicpa-cima.com/',
        retrievedAt: now,
        quotedSection:
          'TEST: If the auditor is unable to obtain sufficient appropriate audit evidence and concludes the possible effects are material but not pervasive, the auditor should qualify the opinion. If the possible effects are material and pervasive, the auditor should disclaim an opinion.',
        domain: 'aicpa-cima.com',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'Publication 946 — How To Depreciate Property (test fixture excerpt)',
        publisher: 'IRS',
        url: 'https://www.irs.gov/publications/p946',
        retrievedAt: now,
        applicableYear: request.taxYear ?? 2025,
        quotedSection:
          'TEST: Under MACRS, most tangible property placed in service after 1986 is recovered using the General Depreciation System and an applicable convention such as the half-year convention.',
        domain: 'irs.gov',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'ASC 360-10 PP&E depreciation concepts (test fixture)',
        publisher: 'FASB',
        url: 'https://www.fasb.org/',
        retrievedAt: now,
        quotedSection:
          'TEST: The depreciable base of PP&E is generally cost less residual value, allocated systematically over useful life. Book methods are distinct from tax MACRS.',
        domain: 'fasb.org',
        allowlisted: true,
        demoData: true,
      },
      {
        title: 'AS 2510 — Auditing Inventories (test fixture)',
        publisher: 'PCAOB',
        url: 'https://pcaobus.org/',
        retrievedAt: now,
        quotedSection:
          'TEST: PCAOB standards address observation of inventories and alternative procedures when observation is not practicable; reporting consequences of scope limitations are addressed in PCAOB reporting standards.',
        domain: 'pcaobus.org',
        allowlisted: true,
        demoData: true,
      },
    ]

    const filtered = catalog.filter((item) => {
      if (!enabled.has(item.domain) && ![...enabled].some((d) => item.domain.endsWith(d))) return false
      // Audit-procedure questions should not receive tax depreciation fixtures.
      if (/\baudit|\bau-?c\b|\bpcaob\b|\bgaas\b|\binventory\b|\bscope\s+limitation\b/.test(q)) {
        if (item.domain === 'aicpa-cima.com') return /au-c|inventory|opinion|evidence|aicpa/i.test(q + item.title)
        if (item.domain === 'pcaobus.org') return true
        return false
      }
      if (/pcaob|issuer/.test(q) && item.domain === 'pcaobus.org') return true
      if (/depreciat|macrs|946/.test(q) && item.domain === 'irs.gov') return true
      if (/gaap|ppe|book/.test(q) && item.domain === 'fasb.org') return true
      if (/depreciat|tax|macrs/.test(q)) return item.domain === 'irs.gov' || item.domain === 'fasb.org'
      return false
    })

    return filtered.map((item) => ({
      ...item,
      allowlisted: true,
      domain: domainOf(item.url) || item.domain,
    }))
  }
}

export function createOfficialResearchProvider(): OfficialSourceResearchProvider {
  if (process.env.CHAI_USE_MOCK_OFFICIAL === '1') {
    return new MockOfficialSourceResearchProvider()
  }
  return new OpenAIWebResearchProvider()
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
    sourceType: 'secondary',
    authorityLevel: result.allowlisted ? 'official_guidance' : 'secondary_analysis',
    quotedText: result.quotedSection,
    sourceUrl: result.url,
    applicableYear: result.applicableYear,
    retrievedAt: result.retrievedAt,
    internalOrExternal: 'external',
    verified: false,
    demoData: result.demoData,
  }
}
