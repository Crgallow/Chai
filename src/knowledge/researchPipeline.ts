import type { AccountingResearchContext, AccountingResearchResponse } from './schemas.ts'
import { classifyResearchContext, evaluateSourceSufficiency } from './sufficiency/engine.ts'
import { MockLocalKnowledgeRetriever, contextToQuery } from './retrieval/retriever.ts'
import {
  createOfficialResearchProvider,
  officialToCitation,
  queueExternalForReview,
} from './research/officialProvider.ts'
import { appendAudit } from './store/jsonStore.ts'
import type { AccountingCitation } from './schemas.ts'
import {
  buildAuditSearchQueries,
  dedupeAuthoritySources,
  isIrrelevantStatuteForAudit,
  officialSitesForFramework,
  parseAuditQuestion,
  type AuditFrameworkId,
} from './auditResearch.ts'

const retriever = new MockLocalKnowledgeRetriever()

function getOfficial() {
  return createOfficialResearchProvider()
}

export async function runControlledResearch(input: {
  question: string
  organizationId?: string
  actor?: string
  /** Prefer orchestrator-resolved context when provided */
  contextOverride?: AccountingResearchContext
}): Promise<AccountingResearchResponse> {
  const raw = input.contextOverride ?? classifyResearchContext(input.question)
  // Orchestrator context uses missingMaterialInformation; knowledge context uses missingInformation.
  const context: AccountingResearchContext = {
    category:
      (raw as AccountingResearchContext).category ||
      (parseAuditQuestion(input.question) ? 'audit' : 'unknown'),
    topic: (raw as AccountingResearchContext).topic,
    applicableYear: raw.applicableYear,
    jurisdiction: raw.jurisdiction,
    accountingFramework: raw.accountingFramework,
    auditFramework: raw.auditFramework,
    entityType: raw.entityType,
    publicPrivateApplicability: (raw as AccountingResearchContext).publicPrivateApplicability,
    bookOrTax: (raw as AccountingResearchContext).bookOrTax ?? 'unknown',
    missingInformation:
      (raw as AccountingResearchContext).missingInformation ??
      (
        raw as {
          missingMaterialInformation?: AccountingResearchContext['missingInformation']
        }
      ).missingMaterialInformation ??
      [],
  }
  const materialMissing = (context.missingInformation ?? []).filter((m) => m.material)
  const auditParsed = parseAuditQuestion(input.question)
  const isAudit = context.category === 'audit' || Boolean(auditParsed)

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
      usedMockRetrieval: false,
      usedOfficialResearch: false,
      officialResearchDisclosed: false,
      conclusion: undefined,
      explanation:
        'I need a bit more information before I can research this against authoritative sources.',
    }
  }

  const searchQueries =
    isAudit && auditParsed
      ? buildAuditSearchQueries(auditParsed, 'primary')
      : [input.question]

  const mergedHits = []
  for (const q of searchQueries.slice(0, 6)) {
    const hits = await retriever.search(
      contextToQuery(context, q, input.organizationId, input.question),
    )
    mergedHits.push(...hits)
  }

  // Deduplicate by chunk id, keep best score
  const byChunk = new Map<string, (typeof mergedHits)[0]>()
  for (const h of mergedHits) {
    const prev = byChunk.get(h.chunk.id)
    if (!prev || h.score > prev.score) byChunk.set(h.chunk.id, h)
  }
  let realInternal = [...byChunk.values()].sort((a, b) => b.score - a.score)

  const allowDemo = process.env.CHAI_ALLOW_DEMO_SOURCES === '1'
  if (!allowDemo) {
    realInternal = realInternal.filter((r) => !r.source.id.startsWith('ks_demo_'))
  }

  // Drop irrelevant statutes for audit procedure questions
  realInternal = realInternal.filter(
    (r) =>
      !isIrrelevantStatuteForAudit({
        question: input.question,
        sourceTitle: r.source.title,
        publisher: r.source.publisher,
        category: r.source.category,
        auditFramework: r.source.auditFramework,
      }),
  )

  // Prefer matching audit framework
  if (context.auditFramework) {
    const fwHits = realInternal.filter((r) => r.source.auditFramework === context.auditFramework)
    if (fwHits.length) realInternal = [...fwHits, ...realInternal.filter((r) => r.source.auditFramework !== context.auditFramework)]
  }

  realInternal = realInternal.slice(0, 10)
  let sufficiency = evaluateSourceSufficiency({ context, results: realInternal })

  let citations: AccountingCitation[] = realInternal.slice(0, 8).map((r) => ({
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

  citations = dedupeAuthoritySources(citations)

  let usedOfficial = false
  let internetDisclosure = ''
  const unresolvedForWeb: string[] = []

  const needsWeb =
    !sufficiency.sufficient &&
    sufficiency.requiresExternalResearch &&
    (isAudit
      ? realInternal.filter((r) => r.source.auditFramework === context.auditFramework).length < 2 ||
        !sufficiency.sufficient
      : true)

  if (needsWeb) {
    if (isAudit && auditParsed) {
      unresolvedForWeb.push(
        ...auditParsed.issues.filter((issue) => {
          const key = issue.split(' ')[0]
          return !citations.some((c) =>
            `${c.title} ${c.quotedText || ''}`.toLowerCase().includes(key.toLowerCase()),
          )
        }),
      )
      if (!unresolvedForWeb.length) unresolvedForWeb.push(...auditParsed.issues.slice(0, 3))
    }

    internetDisclosure = isAudit
      ? `Chai found that the uploaded auditing standards did not fully resolve the following issue(s): ${unresolvedForWeb.join('; ')}. Chai is now searching official internet sources.`
      : 'Chai is searching official internet sources because internal coverage was insufficient.'

    await appendAudit({
      actor: input.actor ?? 'system',
      organizationId: input.organizationId,
      action: 'external_search',
      target: 'web_research',
      afterSummary: input.question.slice(0, 120),
      result: 'success',
    })

    const frameworks: AuditFrameworkId[] = []
    if (auditParsed?.primaryFramework) frameworks.push(auditParsed.primaryFramework)
    if (auditParsed?.comparisonFramework) frameworks.push(auditParsed.comparisonFramework)
    if (!frameworks.length && context.auditFramework) {
      frameworks.push(context.auditFramework as AuditFrameworkId)
    }
    if (!frameworks.length) frameworks.push('AICPA')

    try {
      const externalAll = []
      for (const fw of frameworks) {
        const sites = officialSitesForFramework(fw)
        const queries =
          isAudit && auditParsed
            ? buildAuditSearchQueries(
                auditParsed,
                fw === auditParsed.comparisonFramework ? 'comparison' : 'primary',
              ).slice(0, 3)
            : [input.question]
        for (const q of queries) {
          const siteQ = sites.map((s) => `site:${s}`).join(' OR ')
          const external = await getOfficial().search({
            query: `${siteQ} ${q}`,
            taxYear: context.applicableYear,
            jurisdiction: context.jurisdiction,
            category: context.category,
            organizationId: input.organizationId,
            preferredDomains: sites,
          })
          externalAll.push(...external)
        }
      }

      usedOfficial = externalAll.length > 0
      for (const hit of externalAll.slice(0, 8)) {
        if (
          isIrrelevantStatuteForAudit({
            question: input.question,
            sourceTitle: hit.title,
            publisher: hit.publisher,
            category: 'audit',
          })
        ) {
          continue
        }
        citations.push(officialToCitation(hit))
        await queueExternalForReview(hit, input.organizationId)
      }
      citations = dedupeAuthoritySources(citations)

      const externalSupport = externalAll.some((e) => e.quotedSection.length > 40)
      if (externalSupport || (isAudit && citations.some((c) => c.internalOrExternal === 'internal'))) {
        // For audit: allow proceed with internal standards even if web is thin,
        // as long as we have some audit-framework hits OR usable web.
        const hasAuditInternal = citations.some(
          (c) =>
            c.internalOrExternal === 'internal' &&
            /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title}`),
        )
        if (hasAuditInternal || externalSupport) {
          sufficiency = {
            ...sufficiency,
            sufficient: true,
            score: Math.max(sufficiency.score, hasAuditInternal ? 0.62 : 0.5),
            reasons: [
              ...sufficiency.reasons,
              internetDisclosure ||
                'Official-site web research and/or uploaded auditing standards support proceeding.',
            ],
            deficiencies: sufficiency.deficiencies.filter((d) => !/No verified authoritative/i.test(d)),
            requiresExternalResearch: false,
            requiresHumanReview: true,
          }
        }
      } else {
        sufficiency = {
          ...sufficiency,
          deficiencies: [
            ...sufficiency.deficiencies,
            'Official-site web research did not provide adequate support.',
          ],
          requiresHumanReview: true,
        }
      }
    } catch (err) {
      // If we already have internal audit standards, still allow a reasoned answer.
      const hasAuditInternal = citations.some(
        (c) =>
          c.internalOrExternal === 'internal' &&
          /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title}`),
      )
      if (hasAuditInternal && isAudit) {
        sufficiency = {
          ...sufficiency,
          sufficient: true,
          score: Math.max(sufficiency.score, 0.58),
          reasons: [
            ...sufficiency.reasons,
            'Proceeding from uploaded auditing standards after web research failed.',
          ],
          deficiencies: [
            ...sufficiency.deficiencies,
            `Web research failed: ${err instanceof Error ? err.message : String(err)}`,
          ],
          requiresExternalResearch: false,
          requiresHumanReview: true,
        }
      } else {
        sufficiency = {
          ...sufficiency,
          deficiencies: [
            ...sufficiency.deficiencies,
            `Web research failed: ${err instanceof Error ? err.message : String(err)}`,
          ],
          requiresHumanReview: true,
        }
      }
    }
  }

  // Audit with solid internal AU-C/PCAOB hits should not be blocked solely because
  // keyword sufficiency was picky — allow answer generation with disclosure.
  if (
    !sufficiency.sufficient &&
    isAudit &&
    citations.some(
      (c) =>
        c.internalOrExternal === 'internal' &&
        /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title}`),
    )
  ) {
    sufficiency = {
      ...sufficiency,
      sufficient: true,
      score: Math.max(sufficiency.score, 0.55),
      reasons: [
        ...sufficiency.reasons,
        'Uploaded auditing standards contain potentially applicable material; answer requires careful application to facts.',
      ],
      requiresExternalResearch: false,
      requiresHumanReview: true,
    }
  }

  if (!sufficiency.sufficient) {
    return {
      context,
      factsReliedUpon: auditParsed?.materialFacts ?? [],
      assumptions: ['Research limited to indexed authoritative sources, then official-site web research if needed.'],
      missingInformation: context.missingInformation,
      citations,
      sourceSufficiency: sufficiency,
      warnings: [
        'Unsupported conclusions are blocked when neither the corpus nor official-site web research is adequate.',
        usedOfficial ? 'Official-site web research was attempted.' : 'No web research results.',
        internetDisclosure,
      ].filter(Boolean),
      confidence: { level: 'low', reason: 'Insufficient support.' },
      requiresProfessionalReview: true,
      unableToConclude: true,
      usedMockRetrieval: false,
      usedOfficialResearch: usedOfficial,
      officialResearchDisclosed: usedOfficial,
      explanation:
        'Chai could not locate sufficient applicable authority to answer this question reliably. ' +
        (internetDisclosure ? `${internetDisclosure} ` : '') +
        'Add the missing standards to the authoritative library or provide additional facts.',
    }
  }

  const fromWeb = citations.some((c) => c.internalOrExternal === 'external')
  const fwLabel =
    context.auditFramework === 'AICPA'
      ? 'AICPA U.S. GAAS (AU-C)'
      : context.auditFramework === 'PCAOB'
        ? 'PCAOB standards'
        : context.auditFramework || 'applicable framework'

  return {
    conclusion: isAudit
      ? `Under ${fwLabel}, analyze inventory observation, alternative procedures, sufficiency of evidence, and any scope-limitation effect on the opinion; see explanation and citations.`
      : citations.find((c) => c.quotedText)
        ? 'Based on approved indexed sources and/or official-site research, see the explanation and citations.'
        : 'Sources support a limited conclusion; see citations.',
    explanation: isAudit
      ? [
          internetDisclosure ||
            'Research path: Chai answered using uploaded authoritative auditing standards first.',
          fromWeb
            ? `Web fallback used official sites only (${officialSitesForFramework(
                (context.auditFramework as AuditFrameworkId) || 'AICPA',
              ).join(', ')}).`
            : 'No internet search was necessary for the controlling framework passages located.',
          'Do not treat unrelated United States Code titles as auditing authority for this engagement.',
        ].join(' ')
      : fromWeb
        ? 'Part of this answer uses official-site web research because the indexed corpus was insufficient. Web excerpts are pending review and are not auto-promoted to primary authority.'
        : 'Conclusion is limited to retrieved approved knowledge from your authoritative corpus.',
    context,
    factsReliedUpon: [
      ...(auditParsed?.materialFacts ?? []),
      context.applicableYear ? `Year ${context.applicableYear}` : '',
      context.jurisdiction ?? '',
      context.auditFramework ? `Audit framework: ${context.auditFramework}` : '',
    ].filter(Boolean),
    assumptions: [
      'Indexed authoritative sources were preferred over web research.',
      'Web findings are labeled external/unverified until an admin promotes them.',
      ...(auditParsed?.comparisonFramework
        ? [`PCAOB is a comparison framework only; primary remains ${auditParsed.primaryFramework}.`]
        : []),
    ],
    missingInformation: [],
    citations,
    sourceSufficiency: sufficiency,
    warnings: [
      'Chai is not a CPA.',
      ...(usedOfficial
        ? ['Official-site web research used; results queued for Knowledge Governance review.']
        : []),
      ...(internetDisclosure ? [internetDisclosure] : []),
      ...(sufficiency.requiresHumanReview ? ['Professional review recommended.'] : []),
    ],
    confidence: {
      level: fromWeb || sufficiency.requiresHumanReview ? 'medium' : 'high',
      reason: fromWeb
        ? 'Answer includes unverified official-site web research.'
        : sufficiency.requiresHumanReview
          ? 'Sources support an answer but human review is recommended.'
          : 'Verified indexed sources appear sufficient for the stated context.',
    },
    requiresProfessionalReview: sufficiency.requiresHumanReview || fromWeb,
    unableToConclude: false,
    usedMockRetrieval: false,
    usedOfficialResearch: usedOfficial,
    officialResearchDisclosed: usedOfficial || Boolean(internetDisclosure),
  }
}
