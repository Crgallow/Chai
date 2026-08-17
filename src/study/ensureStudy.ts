import type { StructuredAnswer } from '../types.ts'
import type { CPAStudyResponse, StudyPreference } from './schemas.ts'
import { RESEARCH_VERSION } from '../scoring/evidenceConfidence.ts'

/** Build a CPA study shell focused on teaching + citations (no confidence %). */
export function ensureCPAStudyStructured(
  structured: StructuredAnswer,
  content: string,
  preference?: StudyPreference,
): StructuredAnswer {
  if (structured.cpaStudy) {
    const { evidenceConfidence: _e, sourceQuality: _s, ...rest } = structured.cpaStudy
    return {
      ...structured,
      responseMode: 'cpa_exam_study',
      studyPreference: preference,
      cpaStudy: rest,
      evidenceConfidence: undefined,
      sourceQuality: undefined,
    }
  }

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const study: CPAStudyResponse = {
    mode: 'cpa_exam_study',
    topic: structured.research?.context.category || 'Accounting topic',
    conceptTested: structured.research?.conclusion || paragraphs[0]?.slice(0, 240) || 'See explanation.',
    relevantFacts: structured.research?.factsReliedUpon ?? [],
    distractorFacts: [],
    ruleToRemember:
      structured.research?.explanation?.slice(0, 400) ||
      'Apply the applicable authority to the facts; ask for missing material information.',
    steps: paragraphs.slice(0, 8).map((detail, i) => ({
      id: `live-${i + 1}`,
      title: i === 0 ? 'Tutor explanation' : `Teaching step ${i + 1}`,
      detail: detail.slice(0, 2000),
    })),
    correctAnswer: structured.research?.conclusion,
    calculation: structured.schedules?.[0]
      ? {
          formula: 'See schedule below',
          steps: structured.schedules[0].rows.slice(0, 5).map(
            (r) => `Year ${r.yearIndex}: expense ${r.expense}`,
          ),
          result: `Current-year expense ${structured.schedules[0].currentYearExpense}`,
          passedValidation: structured.schedules[0].validations.length === 0,
        }
      : undefined,
    journalEntries: structured.journalEntries?.map((j) => ({
      memo: j.memo,
      lines: j.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit })),
      balanced: j.balanced,
      debitCreditExplanation: j.balanced
        ? 'Debits equal credits.'
        : 'Entry is out of balance — correct before posting.',
    })),
    assumptions: structured.assumptions ?? structured.research?.assumptions ?? [],
    missingInformation: [
      ...(structured.missingFacts?.map((f) => ({
        field: f,
        reason: 'Requested by tools or research.',
        material: true,
      })) ?? []),
      ...(structured.research?.missingInformation.map((m) => ({
        field: m.field,
        reason: m.reason,
        material: true,
      })) ?? []),
    ],
    citations:
      structured.research?.citations.map((c) => ({
        publisher: c.publisher,
        title: c.title,
        authorityType: c.authorityLevel,
        section: c.section,
        page: c.page,
        applicableYear: c.applicableYear,
        jurisdiction: structured.research?.context.jurisdiction,
        verificationStatus: c.verified ? 'verified' : 'unverified',
        internalOrExternal: c.internalOrExternal,
        excerpt: c.quotedText,
        location: c.sourceUrl,
        demoData: c.demoData,
      })) ?? [],
    requiresProfessionalReview: structured.research?.requiresProfessionalReview ?? true,
    applicableTaxYear: structured.research?.context.applicableYear,
    studyPreferenceApplied: preference,
    generatedAt: new Date().toISOString(),
    researchVersion: RESEARCH_VERSION,
    commonExamTrap: undefined,
    memoryShortcut: undefined,
  }

  return {
    ...structured,
    responseMode: 'cpa_exam_study',
    studyPreference: preference,
    cpaStudy: study,
    evidenceConfidence: undefined,
    sourceQuality: undefined,
  }
}
