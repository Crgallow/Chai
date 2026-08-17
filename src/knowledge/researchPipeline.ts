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
  buildIssueTargetedQueries,
  buildResearchPathDisclosure,
  dedupeAuthoritySources,
  evaluateIssueCoverage,
  extractStandardSectionLabel,
  formatAuthorityUsageBlock,
  isIrrelevantStatuteForAudit,
  officialSitesForFramework,
  parseAuditQuestion,
  summarizeAuthorityUsage,
  type AuditFrameworkId,
} from './auditResearch.ts'

const retriever = new MockLocalKnowledgeRetriever()

function getOfficial() {
  return createOfficialResearchProvider()
}

function hitToCitation(r: Awaited<ReturnType<typeof retriever.search>>[number]): AccountingCitation {
  const section =
    extractStandardSectionLabel(r.chunk.text, r.chunk.section) || r.chunk.section
  return {
    sourceId: r.source.id,
    publisher: r.source.publisher,
    title: r.source.title,
    sourceType: r.source.sourceType,
    authorityLevel: r.source.authorityLevel,
    section,
    paragraph: r.chunk.paragraph,
    page: r.chunk.page,
    quotedText: r.chunk.text.slice(0, 700),
    sourceUrl: r.source.sourceUrl,
    applicableYear: r.source.taxYear,
    effectiveDate: r.source.effectiveDate,
    retrievedAt: new Date().toISOString(),
    internalOrExternal: 'internal',
    verified: r.source.verificationStatus === 'verified',
  }
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

  const mergedHits = [] as Awaited<ReturnType<typeof retriever.search>>
  const issueQueries =
    isAudit && auditParsed
      ? buildIssueTargetedQueries(auditParsed)
      : [
          {
            id: 'general',
            label: 'general',
            framework: (context.auditFramework || 'AICPA') as AuditFrameworkId,
            query: input.question,
          },
        ]

  // Search the entire uploaded library per issue/theme. Do not stop after the first hit.
  // Primary and comparison frameworks are searched separately so PCAOB is not filtered out by AICPA.
  for (const iq of issueQueries) {
    const fwContext: AccountingResearchContext = isAudit
      ? {
          ...context,
          category: 'audit',
          auditFramework: iq.framework,
          // Framework filter is the controlling gate for uploaded standards harvest.
          publicPrivateApplicability: undefined,
        }
      : {
          ...context,
        }
    const hits = await retriever.search(
      contextToQuery(
        fwContext,
        isAudit ? iq.query : input.question,
        input.organizationId,
        input.question,
      ),
    )
    // Keep top matches per issue so multiple sections from one AU-C PDF are retained.
    mergedHits.push(...hits.slice(0, isAudit ? 3 : 8))
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

  // Drop clearly off-topic PCAOB AS when the query names a different AS number.
  if (isAudit) {
    realInternal = realInternal.filter((r) => {
      const q = issueQueries.map((iq) => iq.query).join(' ')
      const wanted = q.match(/\bAS\s+(\d{3,4})\b/gi) || []
      if (!wanted.length) return true
      const title = r.source.title || ''
      if (!/\bAS\s+\d{3,4}\b/i.test(title)) return true
      return wanted.some((w) => new RegExp(w.replace(/\s+/, '\\s*'), 'i').test(title))
    })
  }

  // Keep more passages for audit (many may be from one document).
  realInternal = realInternal.slice(0, isAudit ? 24 : 10)
  let sufficiency = evaluateSourceSufficiency({ context, results: realInternal })

  let citations: AccountingCitation[] = realInternal.map(hitToCitation)
  citations = dedupeAuthoritySources(citations)

  let usedOfficial = false
  let internetDisclosure = ''
  const websitesSearched: string[] = []
  const unresolvedForWeb: string[] = []

  let issueCoverage = evaluateIssueCoverage({
    parsed: auditParsed || {
      issues: [],
      materialFacts: [],
      missingFacts: [],
      primaryFramework: context.auditFramework as AuditFrameworkId | undefined,
    },
    passages: citations.map((c) => ({
      text: `${c.section || ''} ${c.quotedText || ''}`,
      internal: c.internalOrExternal === 'internal',
      title: c.title,
      publisher: c.publisher,
    })),
  })

  const unsupportedThemes = issueCoverage.filter((i) => !i.supported)
  const internalHadPrimary = citations.some(
    (c) =>
      c.internalOrExternal === 'internal' &&
      /aicpa|au-?c|gaas/i.test(`${c.publisher} ${c.title} ${c.quotedText || ''}`),
  )
  const internalHadComparison = citations.some(
    (c) =>
      c.internalOrExternal === 'internal' &&
      /pcaob|\bAS\s+\d{3,4}\b/i.test(
        `${c.publisher} ${c.title} ${c.section || ''} ${c.quotedText || ''}`,
      ),
  )

  // Internet only when material themes remain unresolved after searching the full uploaded standards.
  const reallyNeedsWeb = isAudit && auditParsed ? unsupportedThemes.length > 0 : !sufficiency.sufficient

  if (reallyNeedsWeb && isAudit && auditParsed) {
    unresolvedForWeb.push(...unsupportedThemes.map((t) => t.label))
    const frameworksNeedingWeb: AuditFrameworkId[] = []

    if (unsupportedThemes.some((t) => t.id.startsWith('pcaob')) && !internalHadComparison) {
      frameworksNeedingWeb.push('PCAOB')
    }

    // When AICPA themes are covered internally, do not web-search merely because one theme regex is thin.
    const aicpaUnsupported = unsupportedThemes.filter((t) => !t.id.startsWith('pcaob'))
    if (
      aicpaUnsupported.length &&
      (!internalHadPrimary || (aicpaUnsupported.length >= 4 && !internalHadPrimary))
    ) {
      frameworksNeedingWeb.push(auditParsed.primaryFramework || 'AICPA')
    }

    // If only a few AU-C themes are thin but we already have the AU-C document,
    // do not expand to USC/IRS — stay on AICPA official site only when primary is missing.
    if (!frameworksNeedingWeb.length && aicpaUnsupported.length && !internalHadPrimary) {
      frameworksNeedingWeb.push('AICPA')
    }

    if (frameworksNeedingWeb.length) {
      internetDisclosure = buildResearchPathDisclosure({
        usedInternet: true,
        primaryFramework: auditParsed.primaryFramework,
        comparisonFramework: auditParsed.comparisonFramework,
        unresolvedIssues: unresolvedForWeb,
        internetOrgs: frameworksNeedingWeb.flatMap((fw) => officialSitesForFramework(fw)),
        internalHadPrimary,
        internalHadComparison,
      })

      await appendAudit({
        actor: input.actor ?? 'system',
        organizationId: input.organizationId,
        action: 'external_search',
        target: 'web_research',
        afterSummary: input.question.slice(0, 120),
        result: 'success',
      })

      try {
        const externalAll = []
        for (const fw of frameworksNeedingWeb) {
          const sites = officialSitesForFramework(fw)
          websitesSearched.push(...sites)
          const queries = issueQueries
            .filter((q) => q.framework === fw)
            .map((q) => q.query)
            .slice(0, 4)
          for (const q of queries.length ? queries : [input.question]) {
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

        issueCoverage = evaluateIssueCoverage({
          parsed: auditParsed,
          passages: citations.map((c) => ({
            text: `${c.section || ''} ${c.quotedText || ''}`,
            internal: c.internalOrExternal === 'internal',
            title: c.title,
            publisher: c.publisher,
          })),
        })

        const externalSupport = externalAll.some((e) => e.quotedSection.length > 40)
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
            deficiencies: sufficiency.deficiencies.filter(
              (d) => !/No verified authoritative/i.test(d),
            ),
            requiresExternalResearch: false,
            requiresHumanReview: true,
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
        const hasAuditInternal = citations.some(
          (c) =>
            c.internalOrExternal === 'internal' &&
            /aicpa|pcaob|au-?c|auditing/i.test(`${c.publisher} ${c.title}`),
        )
        if (hasAuditInternal) {
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
  } else if (!isAudit && !sufficiency.sufficient && sufficiency.requiresExternalResearch) {
    // Non-audit path: existing official-site fallback
    internetDisclosure =
      'Chai is searching official internet sources because internal coverage was insufficient.'
    await appendAudit({
      actor: input.actor ?? 'system',
      organizationId: input.organizationId,
      action: 'external_search',
      target: 'web_research',
      afterSummary: input.question.slice(0, 120),
      result: 'success',
    })
    try {
      const sites = officialSitesForFramework(
        (context.auditFramework as AuditFrameworkId) || undefined,
      )
      websitesSearched.push(...sites)
      const external = await getOfficial().search({
        query: input.question,
        taxYear: context.applicableYear,
        jurisdiction: context.jurisdiction,
        category: context.category,
        organizationId: input.organizationId,
        preferredDomains: sites.length ? sites : undefined,
      })
      usedOfficial = external.length > 0
      for (const hit of external.slice(0, 6)) {
        citations.push(officialToCitation(hit))
        await queueExternalForReview(hit, input.organizationId)
      }
      citations = dedupeAuthoritySources(citations)
      if (external.some((e) => e.quotedSection.length > 40)) {
        sufficiency = {
          ...sufficiency,
          sufficient: true,
          score: Math.max(sufficiency.score, 0.5),
          requiresExternalResearch: false,
          requiresHumanReview: true,
        }
      }
    } catch (err) {
      sufficiency = {
        ...sufficiency,
        deficiencies: [
          ...sufficiency.deficiencies,
          `Web research failed: ${err instanceof Error ? err.message : String(err)}`,
        ],
      }
    }
  }

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
        'Uploaded auditing standards contain applicable material across one or more sections; answer requires careful application to facts.',
      ],
      requiresExternalResearch: false,
      requiresHumanReview: true,
    }
  }

  const usage = summarizeAuthorityUsage({
    citations,
    issueCoverage,
    websitesSearched: [...new Set(websitesSearched)],
  })

  if (!sufficiency.sufficient) {
    return {
      context,
      factsReliedUpon: auditParsed?.materialFacts ?? [],
      assumptions: [
        'Research limited to indexed authoritative sources, then official-site web research if needed.',
      ],
      missingInformation: context.missingInformation,
      citations,
      sourceSufficiency: sufficiency,
      warnings: [
        'Unsupported conclusions are blocked when neither the corpus nor official-site web research is adequate.',
        usedOfficial ? 'Official-site web research was attempted.' : 'No web research results.',
        internetDisclosure,
        formatAuthorityUsageBlock(usage),
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

  const researchPath = buildResearchPathDisclosure({
    usedInternet: fromWeb || usedOfficial,
    primaryFramework: auditParsed?.primaryFramework,
    comparisonFramework: auditParsed?.comparisonFramework,
    unresolvedIssues: unresolvedForWeb,
    internetOrgs: [...new Set(websitesSearched)],
    internalHadPrimary,
    internalHadComparison,
  })

  return {
    conclusion: isAudit
      ? `Under ${fwLabel}, analyze inventory observation, alternative procedures, sufficiency of evidence, and any scope-limitation effect on the opinion; see explanation and citations.`
      : citations.find((c) => c.quotedText)
        ? 'Based on approved indexed sources and/or official-site research, see the explanation and citations.'
        : 'Sources support a limited conclusion; see citations.',
    explanation: isAudit
      ? [
          researchPath,
          formatAuthorityUsageBlock(usage),
          usage.issuesSupportedInternally.length
            ? `Issues supported internally: ${usage.issuesSupportedInternally.join('; ')}.`
            : '',
          usage.issuesNeedingInternet.length
            ? `Issues thin or needing fallback: ${usage.issuesNeedingInternet.join('; ')}.`
            : '',
          'Do not treat unrelated United States Code titles as auditing authority for this engagement.',
        ]
          .filter(Boolean)
          .join(' ')
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
      'Multiple sections/paragraphs from one uploaded auditing-standards document count as separate supporting passages, not separate documents.',
      'Web findings are labeled external/unverified until an admin promotes them.',
      ...(auditParsed?.comparisonFramework
        ? [`PCAOB is a comparison framework only; primary remains ${auditParsed.primaryFramework}.`]
        : []),
    ],
    missingInformation: [],
    citations,
    sourceSufficiency: {
      ...sufficiency,
      reasons: [
        ...sufficiency.reasons,
        formatAuthorityUsageBlock(usage),
        `Issue themes supported: ${issueCoverage.filter((i) => i.supported).length}/${issueCoverage.length}`,
      ],
    },
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
