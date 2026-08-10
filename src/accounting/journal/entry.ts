import { roundMoney } from '../depreciation/types'

export interface JournalLineInput {
  account: string
  debit?: number
  credit?: number
  memo?: string
}

export interface JournalLine {
  account: string
  debit: number
  credit: number
  memo?: string
}

export interface JournalEntryResult {
  date?: string
  memo: string
  lines: JournalLine[]
  totalDebits: number
  totalCredits: number
  balanced: boolean
  validations: string[]
  assumptions: string[]
}

export function buildJournalEntry(input: {
  date?: string
  memo?: string
  lines: JournalLineInput[]
  purpose?: string
}): JournalEntryResult {
  if (!input.lines?.length) {
    throw new Error('Journal entry requires at least one line')
  }

  const lines: JournalLine[] = input.lines.map((line, i) => {
    const account = String(line.account || '').trim()
    if (!account) throw new Error(`Line ${i + 1}: account is required`)
    const debit = roundMoney(Number(line.debit ?? 0))
    const credit = roundMoney(Number(line.credit ?? 0))
    if (debit < 0 || credit < 0) throw new Error(`Line ${i + 1}: amounts cannot be negative`)
    if (debit > 0 && credit > 0) {
      throw new Error(`Line ${i + 1}: use either debit or credit, not both`)
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Line ${i + 1}: enter a debit or credit amount`)
    }
    return {
      account,
      debit,
      credit,
      memo: line.memo ? String(line.memo) : undefined,
    }
  })

  const totalDebits = roundMoney(lines.reduce((s, l) => s + l.debit, 0))
  const totalCredits = roundMoney(lines.reduce((s, l) => s + l.credit, 0))
  const balanced = Math.abs(totalDebits - totalCredits) < 0.005

  const validations: string[] = []
  if (balanced) {
    validations.push(`Debits equal credits (${totalDebits}).`)
  } else {
    validations.push(
      `Out of balance: debits ${totalDebits} vs credits ${totalCredits} (difference ${roundMoney(totalDebits - totalCredits)}).`,
    )
  }

  const assumptions = [
    input.purpose ? `Purpose: ${input.purpose}` : 'Journal entry drafted from provided lines.',
    'Confirm account codes against the entity chart of accounts before posting.',
    'Book entries and tax-only adjustments must stay separate when treatments differ.',
  ]

  return {
    date: input.date,
    memo: input.memo?.trim() || 'Journal entry',
    lines,
    totalDebits,
    totalCredits,
    balanced,
    validations,
    assumptions,
  }
}
