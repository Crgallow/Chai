import type { ExamSection } from './schemas.ts'
import type { EvidenceScoringInput } from '../scoring/schemas.ts'
import { computeEvidenceConfidence } from '../scoring/evidenceConfidence.ts'
import { computeSourceQuality } from '../scoring/sourceQuality.ts'
import type { CPAStudyResponse, StudyPreference } from './schemas.ts'
import { RESEARCH_VERSION } from '../scoring/evidenceConfidence.ts'

export interface MockStudyScenario {
  id: string
  match: RegExp
  prompt: string
  examSection: ExamSection
  topic: string
  subtopic?: string
  difficulty: 'foundational' | 'moderate' | 'advanced'
  scoringPreset:
    | 'primary_96'
    | 'strong_86'
    | 'secondary_68'
    | 'missing_49'
    | 'no_source_35'
    | 'superseded_25'
    | 'unbalanced_39'
  build: (preference?: StudyPreference) => Omit<
    CPAStudyResponse,
    'evidenceConfidence' | 'sourceQuality' | 'requiresProfessionalReview' | 'generatedAt' | 'researchVersion'
  > & { scoringInput: EvidenceScoringInput }
}

function baseCitation(overrides: Partial<EvidenceScoringInput['citations'][0]> = {}) {
  return {
    publisher: 'IRS',
    title: 'Publication 946 (demo curriculum excerpt)',
    authorityLevel: 'official_guidance',
    sourceType: 'regulatory',
    quotedText:
      'Demo excerpt for study mode only — not a verbatim reproduction of copyrighted CPA review content.',
    applicableYear: 2025,
    effectiveDate: '2025-01-01',
    superseded: false,
    internalOrExternal: 'internal' as const,
    verified: true,
    demoData: true,
    supportsConclusion: true,
    jurisdiction: 'US-federal',
    ...overrides,
  }
}

function scoringForPreset(
  preset: MockStudyScenario['scoringPreset'],
): EvidenceScoringInput {
  const now = '2026-08-10T12:00:00.000Z'
  switch (preset) {
    case 'primary_96':
      return {
        now,
        citations: [
          baseCitation(),
          baseCitation({
            publisher: 'IRC',
            title: '§168 cost recovery (demo curriculum)',
            authorityLevel: 'primary_authority',
            sourceType: 'authoritative',
          }),
        ],
        validation: {
          calculationRequired: true,
          calculationPassed: true,
          journalRequired: true,
          journalBalanced: true,
          validationMessages: [],
        },
        context: {
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          accountingFramework: 'TAX',
          yearMatters: true,
          jurisdictionMatters: true,
          frameworkMatters: true,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
    case 'strong_86':
      return {
        now,
        citations: [baseCitation({ authorityLevel: 'official_guidance' })],
        validation: {
          calculationRequired: true,
          calculationPassed: true,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
        context: {
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          accountingFramework: 'TAX',
          yearMatters: true,
          jurisdictionMatters: true,
          frameworkMatters: true,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
    case 'secondary_68':
      return {
        now,
        citations: [
          baseCitation({
            publisher: 'Educational summary',
            title: 'Depreciation overview article (secondary)',
            authorityLevel: 'secondary_analysis',
            sourceType: 'educational',
            verified: false,
          }),
        ],
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
        context: {
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          yearMatters: true,
          jurisdictionMatters: true,
          frameworkMatters: false,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
    case 'missing_49':
      return {
        now,
        citations: [baseCitation()],
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
        context: {
          applicableYear: undefined,
          jurisdiction: undefined,
          yearMatters: true,
          jurisdictionMatters: true,
          frameworkMatters: true,
          materialFactsMissing: true,
          missingFactFields: ['applicableYear', 'cost', 'placedInServiceDate'],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
    case 'no_source_35':
      return {
        now,
        citations: [],
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
        context: {
          yearMatters: false,
          jurisdictionMatters: false,
          frameworkMatters: false,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: false,
          mockOrSyntheticOnly: false,
        },
      }
    case 'superseded_25':
      return {
        now,
        citations: [
          baseCitation({
            title: 'Superseded bonus depreciation rule (demo)',
            superseded: true,
            supportsConclusion: true,
          }),
        ],
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: false,
          journalBalanced: null,
          validationMessages: [],
        },
        context: {
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          yearMatters: true,
          jurisdictionMatters: true,
          frameworkMatters: true,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
    case 'unbalanced_39':
      return {
        now,
        citations: [baseCitation()],
        validation: {
          calculationRequired: false,
          calculationPassed: null,
          journalRequired: true,
          journalBalanced: false,
          validationMessages: ['Debits do not equal credits'],
        },
        context: {
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          yearMatters: false,
          jurisdictionMatters: false,
          frameworkMatters: false,
          materialFactsMissing: false,
          missingFactFields: [],
          conflictingUnresolvedAuthority: false,
          conclusionSupportedByCitation: true,
          mockOrSyntheticOnly: false,
        },
      }
  }
}

/** Tune strong_86 to land near 86 by adjusting agreement to single-source 6/10 etc. */
function finalizeScores(input: EvidenceScoringInput, preset: MockStudyScenario['scoringPreset']) {
  // For primary_96 we disable mock-only so score can exceed 50
  if (preset === 'primary_96' || preset === 'strong_86') {
    input = {
      ...input,
      context: { ...input.context, mockOrSyntheticOnly: false },
      citations: input.citations.map((c) => ({ ...c, demoData: false })),
    }
  }
  // strong_86: single official source → agreement 6/10, support slightly lower
  if (preset === 'strong_86') {
    input = {
      ...input,
      citations: [
        {
          ...input.citations[0],
          verified: true,
          authorityLevel: 'official_guidance',
        },
      ],
    }
  }
  // secondary_68: ensure secondary-only path
  if (preset === 'secondary_68') {
    input = {
      ...input,
      context: { ...input.context, mockOrSyntheticOnly: false },
      citations: input.citations.map((c) => ({ ...c, demoData: false })),
    }
  }
  return {
    evidenceConfidence: computeEvidenceConfidence(input),
    sourceQuality: computeSourceQuality(input),
    scoringInput: input,
  }
}

export const MOCK_STUDY_SCENARIOS: MockStudyScenario[] = [
  {
    id: 'far-ppe-capitalization',
    match: /capitaliz|ppe|property.?plant|far.?1|self[- ]constructed/i,
    prompt:
      'A company buys equipment for $40,000 plus $2,000 shipping and $1,500 installation. Training costs $800. What amount is capitalized to PPE?',
    examSection: 'FAR',
    topic: 'PPE capitalization',
    subtopic: 'Initial measurement',
    difficulty: 'foundational',
    scoringPreset: 'primary_96',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'FAR' as const,
      topic: 'PPE capitalization',
      subtopic: 'Initial measurement',
      difficulty: 'foundational' as const,
      correctAnswer: '$43,500',
      conceptTested: 'Costs necessary to bring an asset to the location and condition for intended use are capitalized; training is expensed.',
      relevantFacts: [
        'Purchase price $40,000',
        'Shipping $2,000',
        'Installation $1,500',
        'Employee training $800',
      ],
      distractorFacts: ['Training $800 (period cost, not capitalized)'],
      ruleToRemember: 'Capitalize costs to acquire and prepare PPE for use; expense employee training.',
      steps: [
        { id: 's1', title: 'Identify capitalizable costs', detail: 'Include purchase, shipping, and installation.' },
        {
          id: 's2',
          title: 'Exclude period costs',
          detail: 'Training prepares people, not the asset — expense it.',
        },
        {
          id: 's3',
          title: 'Sum capitalized amount',
          detail: '40,000 + 2,000 + 1,500 = 43,500',
          isCalculation: true,
          formula: 'Capitalized cost = purchase + freight + installation',
        },
      ],
      calculation: {
        formula: 'Capitalized cost = purchase + freight + installation',
        steps: ['40,000 + 2,000 = 42,000', '42,000 + 1,500 = 43,500', 'Exclude training 800'],
        result: '$43,500 capitalized; $800 training expense',
        passedValidation: true,
      },
      journalEntries: [
        {
          memo: 'Record PPE acquisition and training',
          lines: [
            { account: 'Equipment', debit: 43500, credit: 0 },
            { account: 'Training expense', debit: 800, credit: 0 },
            { account: 'Cash', debit: 0, credit: 44300 },
          ],
          balanced: true,
          debitCreditExplanation: 'Debit asset for capitalized costs; debit expense for training; credit cash for total cash outlay.',
        },
      ],
      incorrectChoiceExplanations: [
        { choice: '$40,000', whyWrong: 'Omits necessary shipping and installation.' },
        { choice: '$44,300', whyWrong: 'Incorrectly capitalizes training.' },
        { choice: '$42,000', whyWrong: 'Omits installation.' },
      ],
      commonExamTrap: 'Candidates often capitalize training because it relates to the new asset.',
      memoryShortcut: 'Ready-to-use costs stay on the balance sheet; people-training hits the income statement.',
      similarPracticeQuestion: {
        prompt:
          'Land is purchased for $100,000. Closing costs $3,000. Old building demolition $8,000. Proceeds from salvaged materials $1,000. What is the capitalized land cost?',
        choices: ['$100,000', '$110,000', '$111,000', '$103,000'],
        correctAnswer: '$110,000',
        examSection: 'FAR',
        topic: 'Land capitalization',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['US GAAP financial reporting context.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'FASB (demo curriculum)',
          title: 'PPE initial measurement summary',
          authorityType: 'official_guidance',
          section: 'Initial measurement',
          applicableYear: 2025,
          jurisdiction: 'US',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Costs to bring PPE to location and condition for intended use are included in the asset’s cost.',
          demoData: true,
        },
      ],
      bookVsTaxNote: 'Book capitalization rules may differ from tax basis rules; this item is book-focused.',
      mockLabeled: true,
      scoringInput: scoringForPreset('primary_96'),
    }),
  },
  {
    id: 'reg-macrs-half-year',
    match: /macrs|half[- ]year|reg.?1|what macrs convention/i,
    prompt: 'What MACRS convention generally applies to 5-year personal property placed in service mid-year?',
    examSection: 'REG',
    topic: 'MACRS conventions',
    difficulty: 'moderate',
    scoringPreset: 'strong_86',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'REG' as const,
      topic: 'MACRS conventions',
      difficulty: 'moderate' as const,
      correctAnswer: 'Half-year convention (unless mid-quarter applies)',
      conceptTested: 'Default MACRS convention for personal property and the mid-quarter exception.',
      relevantFacts: ['5-year personal property', 'Placed in service during the year', 'No facts forcing mid-quarter'],
      distractorFacts: ['Mid-month is for real property'],
      ruleToRemember: 'Personal property defaults to half-year; mid-quarter if >40% of personal property is placed in service in Q4.',
      steps: [
        { id: 's1', title: 'Identify property class', detail: '5-year personal property → MACRS personal property rules.' },
        { id: 's2', title: 'Check mid-quarter trigger', detail: 'Without Q4 concentration facts, half-year applies.' },
      ],
      incorrectChoiceExplanations: [
        { choice: 'Mid-month', whyWrong: 'Mid-month applies to real property, not 5-year personalty.' },
        { choice: 'Full-year', whyWrong: 'MACRS does not use a full-year convention for personal property.' },
      ],
      commonExamTrap: 'Applying mid-month to computers or equipment.',
      memoryShortcut: 'Personalty → half-year (watch Q4); realty → mid-month.',
      similarPracticeQuestion: {
        prompt: 'If 45% of a taxpayer’s personal property is placed in service in the fourth quarter, which convention applies?',
        choices: ['Half-year', 'Mid-quarter', 'Mid-month', 'Full-year'],
        correctAnswer: 'Mid-quarter',
        examSection: 'REG',
        topic: 'MACRS mid-quarter',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['US federal tax; no §179/bonus facts given.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'IRS',
          title: 'Publication 946 (demo curriculum excerpt)',
          authorityType: 'official_guidance',
          section: 'Conventions',
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: half-year is the general convention for personal property.',
          demoData: true,
        },
      ],
      applicableTaxYear: 2025,
      bookVsTaxNote: 'Book may use straight-line half-year; tax uses MACRS tables.',
      mockLabeled: true,
      scoringInput: scoringForPreset('strong_86'),
    }),
  },
  {
    id: 'aud-confirmation',
    match: /confirm|accounts receivable|aud.?1|existence assertion/i,
    prompt: 'Positive confirmations of accounts receivable primarily test which assertion?',
    examSection: 'AUD',
    topic: 'Audit assertions — receivables',
    difficulty: 'foundational',
    scoringPreset: 'secondary_68',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'AUD' as const,
      topic: 'Audit assertions — receivables',
      difficulty: 'foundational' as const,
      correctAnswer: 'Existence',
      conceptTested: 'External confirmations provide evidence that recorded receivables exist.',
      relevantFacts: ['Positive confirmation procedure', 'Accounts receivable balance'],
      distractorFacts: ['Completeness is better tested by other procedures'],
      ruleToRemember: 'Confirmations mainly support existence (and rights); completeness needs different tests.',
      steps: [
        { id: 's1', title: 'Link procedure to assertion', detail: 'Asking the customer to confirm a recorded balance tests whether that balance exists.' },
      ],
      incorrectChoiceExplanations: [
        { choice: 'Completeness', whyWrong: 'Confirming recorded balances does not detect unrecorded receivables.' },
        { choice: 'Valuation', whyWrong: 'Confirmations do not prove collectibility.' },
      ],
      commonExamTrap: 'Selecting completeness because confirmations “cover” A/R.',
      memoryShortcut: 'If it is on the books, confirmation asks “are you real?” → existence.',
      similarPracticeQuestion: {
        prompt: 'Which procedure best tests completeness of accounts payable?',
        correctAnswer: 'Search for unrecorded liabilities (e.g., subsequent disbursements).',
        examSection: 'AUD',
        topic: 'Completeness — payables',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['PCAOB/AICPA audit exam framing; educational secondary sources only in this demo.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'Educational summary',
          title: 'Assertions overview (secondary)',
          authorityType: 'secondary_analysis',
          verificationStatus: 'unverified',
          internalOrExternal: 'internal',
          excerpt: 'Demo educational note: confirmations primarily address existence.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('secondary_68'),
    }),
  },
  {
    id: 'bar-budget-variance',
    match: /variance|flexible budget|bar.?1|standard cost/i,
    prompt: 'A flexible budget variance analysis is most useful for evaluating which type of performance?',
    examSection: 'BAR',
    topic: 'Flexible budgets',
    difficulty: 'moderate',
    scoringPreset: 'strong_86',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'BAR' as const,
      topic: 'Flexible budgets',
      difficulty: 'moderate' as const,
      correctAnswer: 'Cost control at the actual activity level',
      conceptTested: 'Flexible budgets adjust for volume so managers are evaluated on controllable cost performance.',
      relevantFacts: ['Actual activity differs from static plan', 'Need volume-adjusted benchmark'],
      distractorFacts: ['Static budget is better for overall plan vs actual volume effects'],
      ruleToRemember: 'Flex the budget to actual volume before judging spending/efficiency.',
      steps: [
        { id: 's1', title: 'Separate volume from spending', detail: 'Rebuild allowed costs at actual output, then compare to actual costs.' },
      ],
      commonExamTrap: 'Blaming managers for volume variances that they do not control.',
      memoryShortcut: 'Flex first, then judge spending.',
      similarPracticeQuestion: {
        prompt: 'Actual volume is higher than budgeted. Static budget variance for variable costs is unfavorable. What should you do next?',
        correctAnswer: 'Prepare a flexible budget at actual volume before concluding on cost control.',
        examSection: 'BAR',
        topic: 'Budget variances',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['Managerial/performance analysis context.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'Curriculum demo',
          title: 'Flexible budgeting summary',
          authorityType: 'official_guidance',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: flexible budgets hold volume constant for performance evaluation.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('strong_86'),
    }),
  },
  {
    id: 'isc-access-controls',
    match: /access control|segregation of duties|isc.?1|itgc|general control/i,
    prompt: 'Preventing a single employee from both approving vendors and recording payables most directly strengthens which IT/internal control concept?',
    examSection: 'ISC',
    topic: 'Segregation of duties',
    difficulty: 'foundational',
    scoringPreset: 'secondary_68',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'ISC' as const,
      topic: 'Segregation of duties',
      difficulty: 'foundational' as const,
      correctAnswer: 'Segregation of duties (authorization vs recording)',
      conceptTested: 'Separating incompatible duties reduces fraud and error risk.',
      relevantFacts: ['Vendor approval', 'Payables recording', 'Same employee currently does both'],
      distractorFacts: ['Encryption addresses confidentiality, not this duty conflict'],
      ruleToRemember: 'Separate authorization, custody, and recording.',
      steps: [
        { id: 's1', title: 'Map incompatible duties', detail: 'Approving vendors (authorization) should not combine with recording payables.' },
      ],
      commonExamTrap: 'Choosing “detective control” when the question asks for the preventive design principle.',
      memoryShortcut: 'ACR: Authorize, Custody, Record — split them.',
      similarPracticeQuestion: {
        prompt: 'Which pairing is incompatible?',
        choices: [
          'Recording cash receipts and reconciling the bank',
          'Approving time sheets only',
          'Reviewing exception reports only',
        ],
        correctAnswer: 'Recording cash receipts and reconciling the bank',
        examSection: 'ISC',
        topic: 'Incompatible duties',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['Internal control / ISC exam framing.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'Educational summary',
          title: 'ITGCs and SoD (secondary)',
          authorityType: 'secondary_analysis',
          verificationStatus: 'unverified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: segregation of duties separates authorization from recording.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('secondary_68'),
    }),
  },
  {
    id: 'tcp-basis-s-corp',
    match: /s[- ]?corp|stock basis|tcp.?1|pass[- ]through/i,
    prompt: 'An S corporation shareholder’s stock basis generally increases for which item?',
    examSection: 'TCP',
    topic: 'S corporation stock basis',
    difficulty: 'moderate',
    scoringPreset: 'strong_86',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'TCP' as const,
      topic: 'S corporation stock basis',
      difficulty: 'moderate' as const,
      correctAnswer: 'Share of ordinary income (and certain separately stated income)',
      conceptTested: 'Basis adjustments for pass-through income and distributions.',
      relevantFacts: ['Shareholder owns S corp stock', 'Entity reports ordinary income'],
      distractorFacts: ['Non-dividend distributions decrease basis (not below zero)'],
      ruleToRemember: 'Income increases basis; distributions and losses decrease basis (ordering rules apply).',
      steps: [
        { id: 's1', title: 'Start with beginning basis', detail: 'Track stock basis separately from debt basis.' },
        { id: 's2', title: 'Apply ordering', detail: 'Increase for income before decreasing for distributions/losses.' },
      ],
      commonExamTrap: 'Decreasing basis for income or increasing basis for distributions.',
      memoryShortcut: 'Income up, distributions/losses down — never ignore ordering.',
      similarPracticeQuestion: {
        prompt: 'Beginning stock basis $10,000. Ordinary income $4,000. Cash distribution $11,000. Ending stock basis?',
        correctAnswer: '$3,000 (and $0 taxable distribution excess in this simplified demo — verify ordering on exam).',
        examSection: 'TCP',
        topic: 'Basis ordering',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['US federal tax; simplified facts.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'IRC (demo curriculum)',
          title: 'S corporation basis adjustments (demo)',
          authorityType: 'primary_authority',
          applicableYear: 2025,
          jurisdiction: 'US-federal',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo curriculum: pass-through income increases shareholder stock basis.',
          demoData: true,
        },
      ],
      applicableTaxYear: 2025,
      mockLabeled: true,
      scoringInput: scoringForPreset('strong_86'),
    }),
  },
  {
    id: 'reg-missing-facts',
    match: /compute .{0,40}depreciation|depreciat.*\?$|what is (the )?depreciation|missing|need (the )?cost|for my machine/i,
    prompt: 'Compute 2025 tax depreciation for my machine.',
    examSection: 'REG',
    topic: 'Tax depreciation — incomplete facts',
    difficulty: 'foundational',
    scoringPreset: 'missing_49',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'REG' as const,
      topic: 'Tax depreciation — incomplete facts',
      difficulty: 'foundational' as const,
      conceptTested: 'Material facts must be obtained before computing MACRS depreciation.',
      relevantFacts: [],
      distractorFacts: [],
      ruleToRemember: 'Do not invent cost, PIS date, class life, or convention.',
      steps: [
        {
          id: 's1',
          title: 'Stop and request facts',
          detail: 'Ask for cost, placed-in-service date, property class, convention, §179/bonus elections, and tax year.',
        },
      ],
      assumptions: [],
      missingInformation: [
        { field: 'cost', reason: 'Asset cost is required for MACRS.', material: true },
        { field: 'placedInServiceDate', reason: 'PIS date drives convention and first-year tables.', material: true },
        { field: 'applicableYear', reason: 'Tax year is material.', material: true },
      ],
      citations: [],
      commonExamTrap: 'Assuming half-year 5-year property without facts.',
      mockLabeled: true,
      scoringInput: scoringForPreset('missing_49'),
    }),
  },
  {
    id: 'far-no-authority',
    match: /unsupported|no authority|guess the gaap/i,
    prompt: 'Guess the GAAP answer without citing anything.',
    examSection: 'FAR',
    topic: 'Unsupported conclusion',
    difficulty: 'foundational',
    scoringPreset: 'no_source_35',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'FAR' as const,
      topic: 'Unsupported conclusion',
      difficulty: 'foundational' as const,
      conceptTested: 'Answers without supporting authority receive low evidence confidence.',
      relevantFacts: [],
      distractorFacts: [],
      ruleToRemember: 'Chai will not invent authoritative support.',
      steps: [
        { id: 's1', title: 'Disclose lack of support', detail: 'No supporting source was found; professional review is required.' },
      ],
      assumptions: [],
      missingInformation: [
        { field: 'authoritativeSource', reason: 'No applicable source attached.', material: true },
      ],
      citations: [],
      mockLabeled: true,
      scoringInput: scoringForPreset('no_source_35'),
    }),
  },
  {
    id: 'reg-superseded',
    match: /superseded|old bonus|100% bonus forever/i,
    prompt: 'Apply a superseded 100% bonus rule incorrectly to 2025.',
    examSection: 'REG',
    topic: 'Superseded tax rule',
    difficulty: 'advanced',
    scoringPreset: 'superseded_25',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'REG' as const,
      topic: 'Superseded tax rule',
      difficulty: 'advanced' as const,
      conceptTested: 'Using superseded guidance incorrectly caps evidence confidence.',
      relevantFacts: ['Question references an outdated bonus percentage'],
      distractorFacts: ['Assuming prior-year percentages still apply'],
      ruleToRemember: 'Always confirm effective dates and sunset provisions for the tax year tested.',
      steps: [
        { id: 's1', title: 'Check effective dates', detail: 'A superseded rule cannot support a current-year conclusion.' },
      ],
      assumptions: ['Demo scenario intentionally uses superseded guidance.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'IRS',
          title: 'Superseded bonus depreciation rule (demo)',
          authorityType: 'official_guidance',
          applicableYear: 2022,
          verificationStatus: 'requires_reverification',
          internalOrExternal: 'internal',
          excerpt: 'Demo: this rule is marked superseded for the requested year.',
          demoData: true,
        },
      ],
      commonExamTrap: 'Memorizing a percentage without the year it applies.',
      mockLabeled: true,
      scoringInput: scoringForPreset('superseded_25'),
    }),
  },
  {
    id: 'far-unbalanced-je',
    match: /unbalanced|out of balance|debits? do not equal/i,
    prompt: 'Draft this journal entry even if debits do not equal credits.',
    examSection: 'FAR',
    topic: 'Journal entry validation',
    difficulty: 'foundational',
    scoringPreset: 'unbalanced_39',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'FAR' as const,
      topic: 'Journal entry validation',
      difficulty: 'foundational' as const,
      correctAnswer: 'Entry is invalid until debits equal credits',
      conceptTested: 'Double-entry validation is deterministic and caps confidence when it fails.',
      relevantFacts: ['Proposed entry fails debit/credit equality'],
      distractorFacts: [],
      ruleToRemember: 'Every journal entry must balance before it can be posted.',
      steps: [
        { id: 's1', title: 'Sum debits and credits', detail: 'If unequal, stop and correct accounts/amounts.' },
      ],
      journalEntries: [
        {
          memo: 'Invalid demo entry',
          lines: [
            { account: 'Expense', debit: 5000, credit: 0 },
            { account: 'Cash', debit: 0, credit: 4000 },
          ],
          balanced: false,
          debitCreditExplanation: 'Debits 5,000 ≠ credits 4,000 — validation failed.',
        },
      ],
      assumptions: [],
      missingInformation: [],
      citations: [
        {
          publisher: 'Curriculum demo',
          title: 'Double-entry principle',
          authorityType: 'official_guidance',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: debits must equal credits.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('unbalanced_39'),
    }),
  },
  {
    id: 'aud-sampling',
    match: /audit sampling|tolerable misstatement|aud.?2/i,
    prompt: 'If tolerable misstatement decreases, what generally happens to sample size (other factors constant)?',
    examSection: 'AUD',
    topic: 'Audit sampling',
    difficulty: 'moderate',
    scoringPreset: 'strong_86',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'AUD' as const,
      topic: 'Audit sampling',
      difficulty: 'moderate' as const,
      correctAnswer: 'Sample size increases',
      conceptTested: 'Inverse relationship between tolerable misstatement and sample size.',
      relevantFacts: ['Tolerable misstatement decreases', 'Other sampling inputs held constant'],
      distractorFacts: [],
      ruleToRemember: 'Stricter tolerance → larger sample.',
      steps: [
        { id: 's1', title: 'Recall sampling relationships', detail: 'Lower tolerable misstatement requires more evidence from the population.' },
      ],
      commonExamTrap: 'Thinking smaller precision allows a smaller sample.',
      memoryShortcut: 'Tighter leash, bigger sample.',
      similarPracticeQuestion: {
        prompt: 'Higher expected misstatement generally does what to sample size?',
        correctAnswer: 'Increases sample size',
        examSection: 'AUD',
        topic: 'Sampling inputs',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['Nonstatistical/statistical relationship as tested on AUD.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'Curriculum demo',
          title: 'Audit sampling relationships',
          authorityType: 'professional_standard',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: lower tolerable misstatement increases sample size.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('strong_86'),
    }),
  },
  {
    id: 'far-lease-classification',
    match: /finance lease|operating lease|lease classif|far.?2/i,
    prompt: 'Under US GAAP, ownership transfer at the end of the lease term generally indicates which lessee classification?',
    examSection: 'FAR',
    topic: 'Lease classification',
    difficulty: 'moderate',
    scoringPreset: 'primary_96',
    build: () => ({
      mode: 'cpa_exam_study' as const,
      examSection: 'FAR' as const,
      topic: 'Lease classification',
      difficulty: 'moderate' as const,
      correctAnswer: 'Finance lease',
      conceptTested: 'Lease classification criteria for lessees under US GAAP.',
      relevantFacts: ['Ownership transfers at end of term'],
      distractorFacts: ['Payment stream alone does not override transfer-of-ownership criterion'],
      ruleToRemember: 'Meet any finance-lease criterion (including ownership transfer) → finance lease for the lessee.',
      steps: [
        { id: 's1', title: 'Apply classification criteria', detail: 'Ownership transfer is a finance-lease indicator.' },
      ],
      incorrectChoiceExplanations: [
        { choice: 'Operating lease', whyWrong: 'Ownership transfer meets a finance-lease criterion.' },
      ],
      commonExamTrap: 'Defaulting to operating lease when a bright-line criterion is clearly met.',
      memoryShortcut: 'If you will own it, finance it (lessee).',
      similarPracticeQuestion: {
        prompt: 'Name one other US GAAP finance-lease criterion besides ownership transfer.',
        correctAnswer: 'Examples: purchase option reasonably certain; lease term major part of economic life; PV substantially all of FV; specialized asset.',
        examSection: 'FAR',
        topic: 'Lease criteria',
        disclaimer: 'Original practice question for study only — not an official AICPA exam question.',
      },
      assumptions: ['US GAAP lessee classification.'],
      missingInformation: [],
      citations: [
        {
          publisher: 'FASB (demo curriculum)',
          title: 'Lease classification criteria',
          authorityType: 'primary_authority',
          verificationStatus: 'verified',
          internalOrExternal: 'internal',
          excerpt: 'Demo: transfer of ownership indicates a finance lease for the lessee.',
          demoData: true,
        },
      ],
      mockLabeled: true,
      scoringInput: scoringForPreset('primary_96'),
    }),
  },
]

export function findMockScenario(question: string): MockStudyScenario {
  // Prefer incomplete-fact / weak-support demos when those signals are present.
  const priority = MOCK_STUDY_SCENARIOS.filter((s) =>
    ['reg-missing-facts', 'far-no-authority', 'reg-superseded', 'far-unbalanced-je'].includes(s.id),
  )
  for (const s of priority) {
    if (s.match.test(question)) return s
  }
  const hit = MOCK_STUDY_SCENARIOS.find((s) => s.match.test(question))
  return hit ?? MOCK_STUDY_SCENARIOS[0]
}

export function buildMockCPAStudyResponse(
  question: string,
  preference?: StudyPreference,
): CPAStudyResponse {
  const scenario = findMockScenario(question)
  const built = scenario.build(preference)
  const { scoringInput, ...rest } = built
  const { evidenceConfidence, sourceQuality } = finalizeScores(scoringInput, scenario.scoringPreset)

  return {
    ...rest,
    studyPreferenceApplied: preference,
    evidenceConfidence,
    sourceQuality,
    requiresProfessionalReview: evidenceConfidence.requiresProfessionalReview,
    generatedAt: new Date().toISOString(),
    researchVersion: RESEARCH_VERSION,
    mockLabeled: true,
  }
}

export const DEMO_QUESTION_PROMPTS = MOCK_STUDY_SCENARIOS.map((s) => ({
  id: s.id,
  examSection: s.examSection,
  topic: s.topic,
  prompt: s.prompt,
}))
