export type MessageRole = 'user' | 'assistant'

export interface ScheduleRowView {
  yearIndex: number
  taxYear?: number
  expense: number
  accumulated: number
  endingBasis: number
  ratePercent?: number
}

export interface ScheduleView {
  label: string
  kind: 'book' | 'tax'
  currentYearExpense: number
  remainingBasis: number
  rows: ScheduleRowView[]
  validations: string[]
}

export interface CitationView {
  id: string
  title: string
  source: string
  url?: string
  excerpt: string
}

export interface ReconciliationView {
  bookExpense: number
  taxExpense: number
  temporaryDifference: number
  hint: string
  assumptions: string[]
}

export interface JournalLineView {
  account: string
  debit: number
  credit: number
  memo?: string
}

export interface JournalEntryView {
  date?: string
  memo: string
  lines: JournalLineView[]
  totalDebits: number
  totalCredits: number
  balanced: boolean
  validations: string[]
}

export interface DocumentQuoteView {
  filename: string
  quote: string
  score: number
  chunkIndex: number
  source?: 'knowledge' | 'user' | 'official'
}

export interface WebCitationView {
  title?: string
  url: string
  snippet?: string
  demoData?: boolean
}

export interface AccountingResearchView {
  conclusion?: string
  explanation?: string
  unableToConclude: boolean
  requiresProfessionalReview: boolean
  usedMockRetrieval?: boolean
  usedOfficialResearch?: boolean
  officialResearchDisclosed?: boolean
  confidence: { level: 'low' | 'medium' | 'high'; reason: string }
  warnings: string[]
  factsReliedUpon: string[]
  assumptions: string[]
  missingInformation: { field: string; reason: string }[]
  context: {
    category: string
    applicableYear?: number
    jurisdiction?: string
    accountingFramework?: string
    auditFramework?: string
    bookOrTax?: string
  }
  citations: {
    publisher: string
    title: string
    authorityLevel: string
    sourceType: string
    quotedText?: string
    sourceUrl?: string
    page?: number
    section?: string
    internalOrExternal: 'internal' | 'external'
    verified: boolean
    demoData?: boolean
    applicableYear?: number
  }[]
  sourceSufficiency: {
    sufficient: boolean
    score: number
    deficiencies: string[]
    reasons: string[]
    requiresHumanReview: boolean
  }
}

export interface StructuredAnswer {
  assumptions?: string[]
  schedules?: ScheduleView[]
  citationIds?: string[]
  citations?: CitationView[]
  reconciliation?: ReconciliationView
  journalEntries?: JournalEntryView[]
  documentQuotes?: DocumentQuoteView[]
  webSearchUsed?: boolean
  webCitations?: WebCitationView[]
  research?: AccountingResearchView
  missingFacts?: string[]
  toolTrace?: string[]
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  structured?: StructuredAnswer
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export type QuickAction = 'depreciation' | 'journal_entries' | 'book_vs_tax' | 'authority'

export type ModelId = 'chai-1.0' | 'chai-fast' | 'chai-deep'

export interface UserProfile {
  name: string
  initials: string
}
