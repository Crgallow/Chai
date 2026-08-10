import { describe, expect, it } from 'vitest'
import { buildJournalEntry } from './entry'

describe('buildJournalEntry', () => {
  it('accepts a balanced depreciation entry', () => {
    const result = buildJournalEntry({
      date: '2025-12-31',
      memo: 'Book depreciation — computers',
      purpose: 'Record annual book depreciation',
      lines: [
        { account: 'Depreciation Expense', debit: 5000 },
        { account: 'Accumulated Depreciation — Computers', credit: 5000 },
      ],
    })
    expect(result.balanced).toBe(true)
    expect(result.totalDebits).toBe(5000)
    expect(result.totalCredits).toBe(5000)
  })

  it('flags unbalanced entries', () => {
    const result = buildJournalEntry({
      lines: [
        { account: 'Cash', debit: 100 },
        { account: 'Revenue', credit: 90 },
      ],
    })
    expect(result.balanced).toBe(false)
    expect(result.validations[0]).toMatch(/Out of balance/)
  })
})
