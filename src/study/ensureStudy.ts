import type { StructuredAnswer } from '../types.ts'
import type { CPAStudyResponse, StudyPreference } from './schemas.ts'
import { attachDeterministicScores } from '../scoring/attach.ts'
import { RESEARCH_VERSION } from '../scoring/evidenceConfidence.ts'

/** Build a CPA study shell from tool/research output when the live model does not emit cpaStudy. */
export function ensureCPAStudyStructured(
  structured: StructuredAnswer,
  content: string,
  preference?: StudyPreference,
): StructuredAnswer {
  if (structured.cpaStudy) {
    return attachDeterministicScores({
      ...structured,
      responseMode: 'cpa_exam_study',
      studyPreference: preference,
    })
  }

  const scored = attachDeterministicScores(structured)
  const evidence = scored.evidenceConfidence!
  const sourceQuality = scored.sourceQuality!

  const study: CPAStudyResponse = {
    mode: 'cpa_exam_study',
    topic: scored.research?.context.category || 'Accounting topic',
    conceptTested: scored.research?.conclusion || content.slice(0, 240) || 'See explanation.',
    relevantFacts: scored.research?.factsReliedUpon ?? [],
    distractorFacts: [],
    ruleToRemember:
      scored.research?.explanation?.slice(0, 280) ||
      'Apply the applicable authority to the facts; ask for missing material information.',
    steps: [
      {
        id: 'live-1',
        title: 'Review the tutor explanation',
        detail: content.slice(0, 1200) || 'See the message body for the step-by-step teaching explanation.',
      },
    ],
    correctAnswer: scored.research?.conclusion,
    calculation: scored.schedules?.[0]
      ? {
          formula: 'See schedule below',
          steps: scored.schedules[0].rows.slice(0, 5).map(
            (r) => `Year ${r.yearIndex}: expense ${r.expense}`,
          ),
          result: `Current-year expense ${scored.schedules[0].currentYearExpense}`,
          passedValidation: scored.schedules[0].validations.length === 0,
        }
      : undefined,
    journalEntries: scored.journalEntries?.map((j) => ({
      memo: j.memo,
      lines: j.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit })),
      balanced: j.balanced,
      debitCreditExplanation: j.balanced
        ? 'Debits equal credits.'
        : 'Entry is out of balance — correct before posting.',
    })),
    assumptions: scored.assumptions ?? scored.research?.assumptions ?? [],
    missingInformation: [
      ...(scored.missingFacts?.map((f) => ({ field: f, reason: 'Requested by tools or research.', material: true })) ??
        []),
      ...(scored.research?.missingInformation.map((m) => ({
        field: m.field,
        reason: m.reason,
        material: true,
      })) ?? []),
    ],
    citations:
      scored.research?.citations.map((c) => ({
        publisher: c.publisher,
        title: c.title,
        authorityType: c.authorityLevel,
        section: c.section,
        page: c.page,
        applicableYear: c.applicableYear,
        jurisdiction: scored.research?.context.jurisdiction,
        verificationStatus: c.verified ? 'verified' : 'unverified',
        internalOrExternal: c.internalOrExternal,
        excerpt: c.quotedText,
        location: c.sourceUrl,
        demoData: c.demoData,
      })) ?? [],
    evidenceConfidence: evidence,
    sourceQuality,
    requiresProfessionalReview: evidence.requiresProfessionalReview,
    applicableTaxYear: scored.research?.context.applicableYear,
    studyPreferenceApplied: preference,
    generatedAt: new Date().toISOString(),
    researchVersion: RESEARCH_VERSION,
    commonExamTrap: undefined,
    memoryShortcut: undefined,
  }

  return {
    ...scored,
    responseMode: 'cpa_exam_study',
    studyPreference: preference,
    cpaStudy: study,
    evidenceConfidence: evidence,
    sourceQuality,
  }
}
