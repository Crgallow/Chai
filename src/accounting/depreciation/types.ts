export type BookMethod = 'straight_line' | 'declining_balance'
export type BookConvention = 'full_year' | 'half_year' | 'none'
export type TaxConvention = 'half_year' | 'mid_quarter'
export type MacrsClass = 3 | 5 | 7 | 10 | 15 | 20

export interface ScheduleRow {
  yearIndex: number
  taxYear?: number
  expense: number
  accumulated: number
  endingBasis: number
  ratePercent?: number
}

export interface DepreciationResult {
  kind: 'book' | 'tax'
  methodLabel: string
  cost: number
  depreciableBasis: number
  currentYearExpense: number
  remainingBasis: number
  schedule: ScheduleRow[]
  assumptions: string[]
  validations: string[]
  citationIds: string[]
}

export interface ReconciliationResult {
  bookExpense: number
  taxExpense: number
  temporaryDifference: number
  hint: string
  assumptions: string[]
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
