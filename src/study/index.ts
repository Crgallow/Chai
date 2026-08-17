import type { StructuredAnswer, Message } from '../types.ts'
import { attachDeterministicScores } from '../scoring/attach.ts'
import { buildMockCPAStudyResponse, findMockScenario, DEMO_QUESTION_PROMPTS } from './mockQuestions.ts'
import type { CPAStudyResponse, ResponseMode, StudyPreference } from './schemas.ts'
import { MODE_SYSTEM_ADDENDA } from './persistence.ts'
import { RESEARCH_VERSION } from '../scoring/evidenceConfidence.ts'

export { DEMO_QUESTION_PROMPTS, findMockScenario, buildMockCPAStudyResponse }
export * from './schemas.ts'
export * from './persistence.ts'

export function lastUserQuestion(history: Message[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content
  }
  return ''
}

export function buildQuickAnswerFromStudy(study: CPAStudyResponse): StructuredAnswer {
  const contentParts = [
    study.correctAnswer ? `Answer: ${study.correctAnswer}` : study.conceptTested,
    study.ruleToRemember,
  ]
  return attachDeterministicScores({
    responseMode: 'quick_answer',
    assumptions: study.assumptions,
    missingFacts: study.missingInformation.map((m) => m.field),
    quickAnswer: {
      answer: study.correctAnswer ?? study.conceptTested,
      explanation: study.ruleToRemember,
      mainSource: study.citations[0]
        ? `${study.citations[0].publisher}: ${study.citations[0].title}`
        : undefined,
    },
    cpaStudy: study,
    evidenceConfidence: study.evidenceConfidence,
    sourceQuality: study.sourceQuality,
    research: {
      conclusion: study.correctAnswer,
      explanation: contentParts.join(' '),
      unableToConclude: study.missingInformation.length > 0 && !study.correctAnswer,
      requiresProfessionalReview: study.requiresProfessionalReview,
      usedMockRetrieval: Boolean(study.mockLabeled),
      usedOfficialResearch: false,
      officialResearchDisclosed: false,
      confidence: {
        level:
          (study.evidenceConfidence?.score ?? 0) >= 75
            ? 'high'
            : (study.evidenceConfidence?.score ?? 0) >= 50
              ? 'medium'
              : 'low',
        reason: 'Advisory label only — use evidenceConfidence for the scored percentage.',
      },
      warnings: study.mockLabeled ? ['Mock/demo study response.'] : [],
      factsReliedUpon: study.relevantFacts,
      assumptions: study.assumptions,
      missingInformation: study.missingInformation.map((m) => ({
        field: m.field,
        reason: m.reason,
      })),
      context: {
        category: 'unknown',
        applicableYear: study.applicableTaxYear,
        jurisdiction: study.citations[0]?.jurisdiction,
        bookOrTax: study.bookVsTaxNote ? 'both' : 'unknown',
      },
      citations: study.citations.map((c) => ({
        publisher: c.publisher,
        title: c.title,
        authorityLevel: c.authorityType,
        sourceType: c.authorityType,
        quotedText: c.excerpt,
        sourceUrl: c.location,
        page: c.page,
        section: c.section,
        internalOrExternal: c.internalOrExternal,
        verified: c.verificationStatus === 'verified',
        demoData: c.demoData,
        applicableYear: c.applicableYear,
      })),
      sourceSufficiency: {
        sufficient: (study.evidenceConfidence?.score ?? 0) >= 60,
        score: (study.evidenceConfidence?.score ?? 0) / 100,
        deficiencies: study.evidenceConfidence?.deficiencies ?? [],
        reasons: study.evidenceConfidence?.reasons ?? [],
        requiresHumanReview: study.requiresProfessionalReview,
      },
    },
  })
}

export function buildMockAgentResult(
  history: Message[],
  mode: ResponseMode,
  preference?: StudyPreference,
): { content: string; structured: StructuredAnswer } {
  const question = lastUserQuestion(history)
  const study = buildMockCPAStudyResponse(question, preference)

  if (mode === 'quick_answer') {
    const structured = buildQuickAnswerFromStudy(study)
    return {
      content: [
        structured.quickAnswer?.answer ?? study.conceptTested,
        structured.quickAnswer?.explanation,
        `Evidence confidence: ${study.evidenceConfidence?.score ?? 0}% (${study.evidenceConfidence?.label ?? 'n/a'}).`,
        'Expand into Professional or CPA Exam Study mode for full teaching detail.',
        '[Mock response — OPENAI_API_KEY not configured]',
      ]
        .filter(Boolean)
        .join('\n\n'),
      structured,
    }
  }

  if (mode === 'cpa_exam_study') {
    const structured = attachDeterministicScores({
      responseMode: 'cpa_exam_study',
      studyPreference: preference,
      cpaStudy: study,
      evidenceConfidence: study.evidenceConfidence,
      sourceQuality: study.sourceQuality,
      assumptions: study.assumptions,
      missingFacts: study.missingInformation.map((m) => m.field),
      journalEntries: study.journalEntries?.map((j) => ({
        memo: j.memo,
        lines: j.lines.map((l) => ({
          account: l.account,
          debit: l.debit,
          credit: l.credit,
        })),
        totalDebits: j.lines.reduce((s, l) => s + l.debit, 0),
        totalCredits: j.lines.reduce((s, l) => s + l.credit, 0),
        balanced: j.balanced,
        validations: j.balanced ? [] : ['Debits do not equal credits'],
      })),
    })
    // Re-attach study scores (authoritative snapshot) without letting attach overwrite with empty research mapping
    structured.evidenceConfidence = study.evidenceConfidence
    structured.sourceQuality = study.sourceQuality
    structured.cpaStudy = study

    return {
      content: [
        'CPA Exam Study Mode (mock/demo — not an official AICPA question).',
        study.correctAnswer ? `Correct answer: ${study.correctAnswer}` : 'Need more facts before a final answer.',
        `Testing: ${study.conceptTested}`,
        `Rule: ${study.ruleToRemember}`,
        `Exam section: ${study.examSection ?? 'n/a'} · Topic: ${study.topic}`,
        `Evidence confidence: ${study.evidenceConfidence?.score ?? 0}% · Source quality: ${study.sourceQuality?.score ?? 0}%`,
      ].join('\n\n'),
      structured,
    }
  }

  // Professional mock
  const structured = buildQuickAnswerFromStudy(study)
  structured.responseMode = 'professional'
  return {
    content: [
      study.correctAnswer ? `Conclusion: ${study.correctAnswer}` : 'Unable to conclude without additional facts.',
      study.conceptTested,
      study.ruleToRemember,
      study.missingInformation.length
        ? `Missing information: ${study.missingInformation.map((m) => m.field).join(', ')}`
        : undefined,
      `Evidence confidence: ${study.evidenceConfidence?.score ?? 0}% (${study.evidenceConfidence?.label ?? 'n/a'}).`,
      '[Mock response — OPENAI_API_KEY not configured]',
    ]
      .filter(Boolean)
      .join('\n\n'),
    structured,
  }
}

export function systemAddendumForMode(mode: ResponseMode): string {
  return MODE_SYSTEM_ADDENDA[mode]
}

export function snapshotScoreMeta(structured: StructuredAnswer): StructuredAnswer {
  const now = new Date().toISOString()
  if (structured.evidenceConfidence) {
    structured.evidenceConfidence = {
      ...structured.evidenceConfidence,
      generatedAt: structured.evidenceConfidence.generatedAt || now,
      researchVersion: structured.evidenceConfidence.researchVersion || RESEARCH_VERSION,
    }
  }
  if (structured.sourceQuality) {
    structured.sourceQuality = {
      ...structured.sourceQuality,
      generatedAt: structured.sourceQuality.generatedAt || now,
      researchVersion: structured.sourceQuality.researchVersion || RESEARCH_VERSION,
    }
  }
  return structured
}
