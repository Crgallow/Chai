import type { AccountingResearchResponse } from './schemas.ts'
import { classifyResearchContext, evaluateSourceSufficiency } from './sufficiency/engine.ts'
import { MockLocalKnowledgeRetriever, contextToQuery } from './retrieval/retriever.ts'
import {
  MockOfficialSourceResearchProvider,
  officialToCitation,
  queueExternalForReview,
} from './research/officialProvider.ts'
import { appendAudit } from './store/jsonStore.ts'
import type { AccountingCitation } from './schemas.ts'

const retriever = new MockLocalKnowledgeRetriever()
const official = new MockOfficialSourceResearchProvider()

export async function runControlledResearch(input: {
  question: string
  organizationId?: string
  actor?: string
}): Promise<AccountingResearchResponse> {
  const context = classifyResearchContext(input.question)
  const materialMissing = context.missingInformation.filter((m) => m.material)

  if (materialMissing.length) {
    return {
      context,
      factsReliedUpon: [],
      assumptions: [],
      missingInformation: materialMissing,
      citations: [],
      sourceSufficiency: {
        sufficient: false,
        score: 0.2,
        reasons: [],
        deficiencies: materialMissing.map((m) => m.reason),
        conflictingSourceIds: [],
        requiresExternalResearch: false,
        requiresHumanReview: true,
      },
      warnings: ['Material context is missing; Chai will not assume facts silently.'],
      confidence: { level: 'low', reason: 'Missing material research context.' },
      requiresProfessionalReview: true,
      unableToConclude: true,
      usedMockRetrieval: true,
      usedOfficialResearch: false,
      officialResearchDisclosed: false,
      conclusion: undefined,
      explanation:
        'I found potentially relevant guidance, but I could not locate sufficient authoritative support for a reliable conclusion. Additional research or professional review is required.',
    }
  }

  const internal = await retriever.search(contextToQuery(context, input.question, input.organizationId))
  let sufficiency = evaluateSourceSufficiency({ context, results: internal })

  const citations: AccountingCitation[] = internal.slice(0, 5).map((r) => ({
    sourceId: r.source.id,
    publisher: r.source.publisher,
    title: r.source.title,
    sourceType: r.source.sourceType,
    authorityLevel: r.source.authorityLevel,
    section: r.chunk.section,
    paragraph: r.chunk.paragraph,
    page: r.chunk.page,
    quotedText: r.chunk.text.slice(0, 500),
    sourceUrl: r.source.sourceUrl,
    applicableYear: r.source.taxYear,
    effectiveDate: r.source.effectiveDate,
    retrievedAt: new Date().toISOString(),
    internalOrExternal: 'internal' as const,
    verified: r.source.verificationStatus === 'verified',
  }))

  let usedOfficial = false
  if (!sufficiency.sufficient && sufficiency.requiresExternalResearch) {
    await appendAudit({
      actor: input.actor ?? 'system',
      organizationId: input.organizationId,
      action: 'external_search',
      target: 'official_provider',
      afterSummary: input.question.slice(0, 120),
      result: 'success',
    })
    const external = await official.search({
      query: input.question,
      taxYear: context.applicableYear,
      jurisdiction: context.jurisdiction,
      category: context.category,
      organizationId: input.organizationId,
    })
    usedOfficial = true
    for (const hit of external) {
      citations.push(officialToCitation(hit))
      await queueExternalForReview(hit, input.organizationId)
    }
    // Re-evaluate with external as supplemental — snippets alone never flip sufficiency without evaluation
    const externalSupport = external.some((e) => e.quotedSection.length > 40 && e.allowlisted)
    if (externalSupport && citations.some((c) => c.internalOrExternal === 'external' && c.quotedText)) {
      sufficiency = {
        ...sufficiency,
        sufficient: true,
        score: Math.max(sufficiency.score, 0.55),
        reasons: [
          ...sufficiency.reasons,
          'Approved-domain official research returned usable excerpts (demo/mock provider).',
        ],
        deficiencies: sufficiency.deficiencies.filter((d) => !/No verified authoritative/i.test(d)),
        requiresExternalResearch: false,
        requiresHumanReview: true,
      }
    } else {
      sufficiency = {
        ...sufficiency,
        deficiencies: [
          ...sufficiency.deficiencies,
          'Official-source research did not provide adequate authoritative support.',
        ],
        requiresHumanReview: true,
      }
    }
  }

  if (!sufficiency.sufficient) {
    return {
      context,
      factsReliedUpon: [],
      assumptions: ['Research limited to approved internal sources and approved-domain official research.'],
      missingInformation: context.missingInformation,
      citations,
      sourceSufficiency: sufficiency,
      warnings: [
        'Unsupported conclusions are blocked.',
        usedOfficial ? 'Official website research was attempted (mock/demo provider).' : 'No official research triggered.',
        'Mock retrieval is active — not production semantic search.',
      ],
      confidence: { level: 'low', reason: 'Insufficient authoritative support.' },
      requiresProfessionalReview: true,
      unableToConclude: true,
      usedMockRetrieval: true,
      usedOfficialResearch: usedOfficial,
      officialResearchDisclosed: usedOfficial,
      explanation:
        'I found potentially relevant guidance, but I could not locate sufficient authoritative support for a reliable conclusion. Additional research or professional review is required.',
    }
  }

  const primaryQuote = citations.find((c) => c.quotedText)?.quotedText
  return {
    conclusion: primaryQuote
      ? `Based on approved sources, the applicable guidance supports a conclusion consistent with the cited materials for the stated context.`
      : 'Approved sources support a limited conclusion; see citations.',
    explanation:
      'Conclusion is limited to retrieved approved knowledge and/or approved-domain official excerpts. Internal policies are labeled separately and are not primary legal authority.',
    context,
    factsReliedUpon: [
      context.applicableYear ? `Year ${context.applicableYear}` : 'Year as stated in question',
      context.jurisdiction ?? 'Jurisdiction as stated',
      context.bookOrTax !== 'unknown' ? `Book/tax scope: ${context.bookOrTax}` : 'Book/tax scope as stated',
    ],
    assumptions: [
      'Only approved (or historically applicable superseded) sources were considered.',
      'Sufficiency score is not a guarantee of correctness.',
    ],
    missingInformation: [],
    citations,
    sourceSufficiency: sufficiency,
    warnings: [
      'Chai is not a CPA.',
      'Mock retrieval active.',
      ...(usedOfficial ? ['Searched approved official websites (mock provider); external sources need admin promotion for permanent KB inclusion.'] : []),
      ...(sufficiency.requiresHumanReview ? ['Professional review recommended due to conflicts or residual risk.'] : []),
    ],
    confidence: {
      level: sufficiency.requiresHumanReview ? 'medium' : 'high',
      reason: sufficiency.requiresHumanReview
        ? 'Sources support an answer but human review is recommended.'
        : 'Verified approved sources appear sufficient for the stated context.',
    },
    requiresProfessionalReview: sufficiency.requiresHumanReview,
    unableToConclude: false,
    usedMockRetrieval: true,
    usedOfficialResearch: usedOfficial,
    officialResearchDisclosed: usedOfficial,
  }
}
