import type { Message, ModelId, StructuredAnswer } from '../src/types.ts'
import type { ResponseMode, StudyPreference } from '../src/study/schemas.ts'
import { attachDeterministicScores } from '../src/scoring/attach.ts'
import { snapshotScoreMeta } from '../src/study/index.ts'
import { ensureCPAStudyStructured } from '../src/study/ensureStudy.ts'
import { runAccountingResearchWorkflow } from './research/runResearch.ts'
import type { ResearchProgressEvent, ResearchRun } from '../src/research/schemas.ts'
import { setDocumentSearchHandler, setKnowledgeResearchHandler } from '../src/accounting/tools.ts'
import { searchDocuments } from './documents.ts'
import { runControlledResearch } from '../src/knowledge/researchPipeline.ts'
import { isAccountingResearchQuestion } from './intent.ts'
import { createConversationalReply } from './chat/conversational.ts'

setDocumentSearchHandler(searchDocuments)
setKnowledgeResearchHandler(async (question) => {
  const research = await runControlledResearch({ question, organizationId: 'platform', actor: 'agent' })
  return {
    conclusion: research.conclusion,
    explanation: research.explanation,
    unableToConclude: research.unableToConclude,
    requiresProfessionalReview: research.requiresProfessionalReview,
    usedMockRetrieval: research.usedMockRetrieval,
    usedOfficialResearch: research.usedOfficialResearch,
    officialResearchDisclosed: research.officialResearchDisclosed,
    confidence: research.confidence,
    warnings: research.warnings,
    factsReliedUpon: research.factsReliedUpon,
    assumptions: research.assumptions,
    missingInformation: research.missingInformation.map((m) => ({
      field: m.field,
      reason: m.reason,
    })),
    context: {
      category: research.context.category,
      applicableYear: research.context.applicableYear,
      jurisdiction: research.context.jurisdiction,
      accountingFramework: research.context.accountingFramework,
      auditFramework: research.context.auditFramework,
      bookOrTax: research.context.bookOrTax,
    },
    citations: research.citations,
    sourceSufficiency: {
      sufficient: research.sourceSufficiency.sufficient,
      score: research.sourceSufficiency.score,
      deficiencies: research.sourceSufficiency.deficiencies,
      reasons: research.sourceSufficiency.reasons,
      requiresHumanReview: research.sourceSufficiency.requiresHumanReview,
    },
  }
})

function lastUserQuestion(history: Message[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content
  }
  return history[history.length - 1]?.content ?? ''
}

function requireOpenAiKey(): void {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required. Add it to your .env to use Chai.')
  }
}

function structuredFromResearchRun(run: ResearchRun, content: string): StructuredAnswer {
  const researchView =
    run.primarySources.length || run.secondarySources.length || run.status === 'blocked'
      ? {
          conclusion: run.insufficientAuthority ? undefined : content.slice(0, 280),
          explanation: content,
          unableToConclude: run.insufficientAuthority || run.status === 'blocked',
          requiresProfessionalReview: true,
          usedMockRetrieval: false,
          usedOfficialResearch: run.stages.some((s) =>
            s.toolCalls.some((t) => t.name.includes('official') || t.name.includes('web')),
          ),
          officialResearchDisclosed: true,
          confidence: {
            level: run.insufficientAuthority ? ('low' as const) : ('medium' as const),
            reason: 'Advisory only — not a probability of correctness.',
          },
          warnings: run.stages.flatMap((s) => s.warnings),
          factsReliedUpon: run.facts?.userProvidedFacts ?? [],
          assumptions: run.context?.assumptions.map((a) => a.statement) ?? [],
          missingInformation: [
            ...(run.facts?.potentiallyMissingFacts.map((m) => ({
              field: m.field,
              reason: m.reason,
            })) ?? []),
            ...(run.context?.missingMaterialFacts.map((m) => ({
              field: m.field,
              reason: m.reason,
            })) ?? []),
          ],
          context: {
            category: run.issues[0]?.category ?? 'unknown',
            applicableYear: run.context?.taxYear,
            jurisdiction: run.context?.jurisdiction,
            accountingFramework: run.context?.accountingFramework,
            auditFramework: run.context?.auditFramework,
            bookOrTax: run.context?.bookOrTax,
          },
          citations: [...run.primarySources, ...run.secondarySources].map((s) => ({
            publisher: s.publisher,
            title: s.title,
            authorityLevel: s.authorityType,
            sourceType: s.primaryOrSecondary,
            quotedText: s.exactPassage,
            sourceUrl: s.sourceUrl,
            page: s.page,
            section: s.section,
            internalOrExternal: (s.sourceUrl ? 'external' : 'internal') as 'internal' | 'external',
            verified: s.verificationStatus === 'verified',
            demoData: s.demoData,
            applicableYear: s.applicableYear,
          })),
          sourceSufficiency: {
            sufficient: !run.insufficientAuthority && run.status === 'completed',
            score: run.citationCoverage?.passed ? 0.8 : 0.3,
            deficiencies: run.citationCoverage?.uncitedConclusions ?? [],
            reasons: [run.citationCoverage?.summary ?? ''],
            requiresHumanReview: true,
          },
        }
      : undefined

  return snapshotScoreMeta(
    attachDeterministicScores({
      assumptions: run.context?.assumptions.map((a) => a.statement) ?? [],
      missingFacts: [
        ...(run.facts?.potentiallyMissingFacts.map((m) => m.field) ?? []),
        ...(run.context?.missingMaterialFacts.map((m) => m.field) ?? []),
      ],
      research: researchView,
      researchProcess: run,
      toolTrace: run.stages.flatMap((s) => s.toolCalls.map((t) => `${s.stage}:${t.name}`)),
    }),
  )
}

export interface AgentResult {
  content: string
  structured: StructuredAnswer
}

export interface AgentOptions {
  mode?: ResponseMode
  studyPreference?: StudyPreference
  onResearchProgress?: (event: ResearchProgressEvent) => void | Promise<void>
}

/**
 * Conversational chat for non-accounting messages.
 * Accounting questions use the research pipeline + authoritative corpus (web fallback if needed).
 */
export async function runAccountingAgent(
  history: Message[],
  model: ModelId,
  signal?: AbortSignal,
  options: AgentOptions = {},
): Promise<AgentResult> {
  requireOpenAiKey()

  const mode = options.mode ?? 'professional'
  const studyPreference = options.studyPreference
  const question = lastUserQuestion(history)

  if (!isAccountingResearchQuestion(question)) {
    return createConversationalReply({
      history,
      model,
      mode,
      studyPreference,
      signal,
    })
  }

  const { run, content } = await runAccountingResearchWorkflow({
    question,
    model,
    signal,
    responseMode: mode,
    onProgress: options.onResearchProgress,
  })

  let structured = structuredFromResearchRun(run, content)
  structured.responseMode = mode
  structured.studyPreference = studyPreference

  if (mode === 'cpa_exam_study') {
    structured = snapshotScoreMeta(ensureCPAStudyStructured(structured, content, studyPreference))
    // Study mode: citations + deep teaching, no probability meters.
    delete structured.evidenceConfidence
    delete structured.sourceQuality
    if (structured.cpaStudy) {
      const { evidenceConfidence: _e, sourceQuality: _s, ...rest } = structured.cpaStudy
      structured.cpaStudy = rest
    }
  }
  if (mode === 'quick_answer') {
    structured.quickAnswer = {
      answer: content.split('\n').find((l) => l.trim())?.slice(0, 240) || content.slice(0, 240),
      explanation: content.slice(0, 400),
      mainSource: run.primarySources[0]
        ? `${run.primarySources[0].publisher}: ${run.primarySources[0].title}`
        : undefined,
    }
  }

  return { content, structured }
}
