import type {
  AccountingResearchContext,
  DocumentChunk,
  KnowledgeSource,
} from '../schemas.ts'
import { listChunksForSource, listSources } from '../store/jsonStore.ts'
import {
  isAuditCategorySource,
  isIrrelevantStatuteForAudit,
  scoreAuditPassageRelevance,
  tokenizeForAuditSearch,
} from '../auditResearch.ts'

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
  /** Original user question — used for relevance / USC blocking */
  originalQuestion?: string
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
  return tokenizeForAuditSearch(s)
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
    return { ok: false, reason: 'year mismatch' }
  }
  if (
    query.jurisdiction &&
    source.jurisdiction &&
    !source.jurisdiction.toLowerCase().includes(query.jurisdiction.toLowerCase()) &&
    query.jurisdiction.toLowerCase() !== 'us-federal' &&
    source.jurisdiction.toLowerCase() !== 'us-federal'
  ) {
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

  if (query.category === 'audit' || query.auditFramework) {
    if (
      isIrrelevantStatuteForAudit({
        question: query.originalQuestion || query.searchTerms,
        sourceTitle: source.title,
        publisher: source.publisher,
        category: source.category,
        auditFramework: source.auditFramework,
      })
    ) {
      return { ok: false, reason: 'irrelevant statute for audit procedure question' }
    }
    if (query.auditFramework) {
      if (source.auditFramework && source.auditFramework !== query.auditFramework) {
        return { ok: false, reason: 'audit framework mismatch' }
      }
      if (!source.auditFramework && !isAuditCategorySource(source)) {
        return { ok: false, reason: 'not an audit-standards source' }
      }
    } else if (query.category === 'audit' && source.category && source.category !== 'audit') {
      if (!isAuditCategorySource(source)) {
        return { ok: false, reason: 'wrong category for audit research' }
      }
    }
  }

  if (
    query.publicPrivateApplicability &&
    source.publicPrivateApplicability &&
    source.publicPrivateApplicability !== 'both' &&
    source.publicPrivateApplicability !== 'not_applicable' &&
    source.publicPrivateApplicability !== query.publicPrivateApplicability
  ) {
    return { ok: false, reason: 'public/private applicability mismatch' }
  }

  return { ok: true }
}

export class MockLocalKnowledgeRetriever implements AccountingKnowledgeRetriever {
  async search(query: AccountingResearchQuery): Promise<KnowledgeSearchResult[]> {
    const sources = await listSources()
    const results: KnowledgeSearchResult[] = []
    const isAudit = Boolean(query.category === 'audit' || query.auditFramework)
    const auditLexiconQuery = /\b(pcaob|aicpa|au-?c|gaas|auditing\s+standard)\b/i.test(
      `${query.searchTerms} ${query.originalQuestion || ''}`,
    )

    // Only scan chunks for sources that pass retrieval gates.
    // Audit queries stay inside auditing-standards sources; tax/other queries skip AU-C/PCAOB bulk
    // and skip USC title digests unless the question is statutory.
    const needsStatute = /\b(irc|internal revenue code|united states code|u\.s\.c\.|usc\b|statute)\b/i.test(
      `${query.originalQuestion || ''} ${query.searchTerms}`,
    )
    const eligible = sources.filter((s) => {
      if (!isRetrievable(s, query).ok) return false
      if (isAudit) {
        if (query.auditFramework && s.auditFramework && s.auditFramework !== query.auditFramework) {
          return false
        }
        return isAuditCategorySource(s)
      }
      // Allow explicit PCAOB/AICPA lexicon probes (governance tests / framework mismatch checks).
      if (auditLexiconQuery && isAuditCategorySource(s)) return true
      if (s.category === 'audit' || s.auditFramework) return false
      if (/united states code|\busc\d/i.test(`${s.title} ${s.id}`) && !needsStatute) return false
      if (query.category && s.category && s.category !== query.category) return false
      if (query.taxYear && s.taxYear && s.taxYear !== query.taxYear && !query.allowHistoricalSuperseded) {
        return false
      }
      return true
    })
    // Prefer year-matched / small demo sources first so tests stay fast even with large corpora.
    eligible.sort((a, b) => {
      const aDemo = a.id.startsWith('ks_demo_') ? 0 : 1
      const bDemo = b.id.startsWith('ks_demo_') ? 0 : 1
      if (aDemo !== bDemo) return aDemo - bDemo
      const aYear = query.taxYear && a.taxYear === query.taxYear ? 0 : 1
      const bYear = query.taxYear && b.taxYear === query.taxYear ? 0 : 1
      return aYear - bYear
    })
    const toScan = isAudit ? eligible : eligible.slice(0, 24)
    const chunkLists = await Promise.all(toScan.map((s) => listChunksForSource(s.id)))

    for (let i = 0; i < toScan.length; i++) {
      const source = toScan[i]
      const chunks = chunkLists[i]
      for (const chunk of chunks) {
        const hay = `${source.title} ${source.publisher} ${source.topic ?? ''} ${chunk.text}`
        let score = isAudit
          ? scoreAuditPassageRelevance(chunk.text, query.searchTerms, {
              title: source.title,
              publisher: source.publisher,
              auditFramework: source.auditFramework,
            })
          : scoreText(hay, tokenize(query.searchTerms))
        if (query.topic && source.topic?.toLowerCase().includes(query.topic.toLowerCase())) {
          score += 0.2
        }
        if (query.auditFramework && source.auditFramework === query.auditFramework) {
          score += 0.25
        }
        if (isAudit && chunk.page != null && chunk.page >= 50) score += 0.05
        if (isAudit && /AU-C\s*(?:Sec(?:tion)?\.?\s*)?\d{3}|AS\s+\d{3,4}/i.test(chunk.text)) {
          score += 0.1
        }
        if (score <= 0.12) continue
        results.push({ source, chunk, score, retrievalMode: 'mock_local' })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, isAudit ? 28 : 16)
  }
}

export function contextToQuery(
  context: AccountingResearchContext,
  searchTerms: string,
  organizationId?: string,
  originalQuestion?: string,
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
    originalQuestion,
  }
}
