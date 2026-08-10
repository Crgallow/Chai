import type {
  AccountingResearchContext,
  DocumentChunk,
  KnowledgeSource,
} from '../schemas.ts'
import { listChunks, listSources } from '../store/jsonStore.ts'

export interface AccountingResearchQuery {
  searchTerms: string
  category?: string
  topic?: string
  taxYear?: number
  jurisdiction?: string
  accountingFramework?: string
  auditFramework?: string
  entityType?: string
  publicPrivateApplicability?: string
  authorityLevel?: string
  organizationId?: string
  includeExcludedStatuses?: boolean
  allowHistoricalSuperseded?: boolean
}

export interface KnowledgeSearchResult {
  source: KnowledgeSource
  chunk: DocumentChunk
  score: number
  retrievalMode: 'mock_local'
}

export interface AccountingKnowledgeRetriever {
  search(query: AccountingResearchQuery): Promise<KnowledgeSearchResult[]>
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
}

function scoreText(hay: string, terms: string[]): number {
  if (!terms.length) return 0
  const h = hay.toLowerCase()
  let hits = 0
  for (const t of terms) if (h.includes(t)) hits++
  return hits / terms.length
}

function isRetrievable(
  source: KnowledgeSource,
  query: AccountingResearchQuery,
): { ok: boolean; reason?: string } {
  if (query.includeExcludedStatuses) return { ok: true }

  if (['draft', 'rejected', 'disabled'].includes(source.status)) {
    return { ok: false, reason: `status ${source.status}` }
  }
  if (source.indexingStatus === 'failed' || source.indexingStatus === 'not_started') {
    return { ok: false, reason: 'not indexed' }
  }
  if (source.status === 'superseded') {
    if (
      query.allowHistoricalSuperseded &&
      query.taxYear &&
      source.taxYear &&
      query.taxYear <= source.taxYear
    ) {
      return { ok: true }
    }
    if (query.allowHistoricalSuperseded && query.taxYear && source.taxYear === query.taxYear) {
      return { ok: true }
    }
    return { ok: false, reason: 'superseded' }
  }
  if (source.status !== 'approved') return { ok: false, reason: 'not approved' }

  if (query.organizationId && source.organizationId && source.organizationId !== query.organizationId) {
    return { ok: false, reason: 'org isolation' }
  }
  if (query.taxYear && source.taxYear && source.taxYear !== query.taxYear) {
    // Allow undated sources; exclude wrong year
    return { ok: false, reason: 'year mismatch' }
  }
  if (
    query.jurisdiction &&
    source.jurisdiction &&
    !source.jurisdiction.toLowerCase().includes(query.jurisdiction.toLowerCase()) &&
    query.jurisdiction.toLowerCase() !== 'us-federal' &&
    source.jurisdiction.toLowerCase() !== 'us-federal'
  ) {
    // soft: if both set and clearly incompatible
    if (
      source.jurisdiction.toLowerCase() !== query.jurisdiction.toLowerCase() &&
      !source.jurisdiction.toLowerCase().includes('us')
    ) {
      return { ok: false, reason: 'jurisdiction mismatch' }
    }
  }
  if (
    query.accountingFramework &&
    source.accountingFramework &&
    source.accountingFramework !== query.accountingFramework
  ) {
    return { ok: false, reason: 'framework mismatch' }
  }
  if (query.auditFramework && source.auditFramework && source.auditFramework !== query.auditFramework) {
    return { ok: false, reason: 'audit framework mismatch' }
  }
  if (query.category && source.category !== query.category) {
    // allow regulatory cross-read lightly by not hard-failing unknown
  }
  return { ok: true }
}

export class MockLocalKnowledgeRetriever implements AccountingKnowledgeRetriever {
  async search(query: AccountingResearchQuery): Promise<KnowledgeSearchResult[]> {
    const [sources, chunks] = await Promise.all([listSources(), listChunks()])
    const terms = tokenize(query.searchTerms)
    const byId = new Map(sources.map((s) => [s.id, s]))
    const results: KnowledgeSearchResult[] = []

    for (const chunk of chunks) {
      const source = byId.get(chunk.sourceId)
      if (!source) continue
      const gate = isRetrievable(source, query)
      if (!gate.ok) continue
      const score =
        scoreText(`${source.title} ${source.publisher} ${source.topic ?? ''} ${chunk.text}`, terms) +
        (query.topic && source.topic?.toLowerCase().includes(query.topic.toLowerCase()) ? 0.2 : 0)
      if (score <= 0) continue
      results.push({ source, chunk, score, retrievalMode: 'mock_local' })
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 12)
  }
}

export function contextToQuery(
  context: AccountingResearchContext,
  searchTerms: string,
  organizationId?: string,
): AccountingResearchQuery {
  return {
    searchTerms,
    category: context.category === 'unknown' ? undefined : context.category,
    topic: context.topic,
    taxYear: context.applicableYear,
    jurisdiction: context.jurisdiction,
    accountingFramework: context.accountingFramework,
    auditFramework: context.auditFramework,
    entityType: context.entityType,
    publicPrivateApplicability: context.publicPrivateApplicability,
    organizationId,
    allowHistoricalSuperseded: Boolean(context.applicableYear),
  }
}
