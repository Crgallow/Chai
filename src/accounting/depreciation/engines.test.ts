import { describe, expect, it } from 'vitest'
import { computeBookDepreciation, computeTaxDepreciation, reconcileBookTax } from './index'
import { MACRS_HALF_YEAR } from './macrsTables'

describe('book straight-line', () => {
  it('computes half-year SL for 5-year $50k no salvage in 2025', () => {
    const result = computeBookDepreciation({
      cost: 50000,
      salvage: 0,
      usefulLifeYears: 5,
      method: 'straight_line',
      convention: 'half_year',
      placedInServiceDate: '2025-03-15',
      targetTaxYear: 2025,
    })
    expect(result.currentYearExpense).toBe(5000)
    expect(result.schedule[0].expense).toBe(5000)
    expect(result.schedule[1].expense).toBe(10000)
    const sum = result.schedule.reduce((s, r) => s + r.expense, 0)
    expect(sum).toBeCloseTo(50000, 1)
  })
})

describe('MACRS tax', () => {
  it('matches Pub 946 5-year half-year year-1 20%', () => {
    expect(MACRS_HALF_YEAR[5][0]).toBe(20)
    const result = computeTaxDepreciation({
      cost: 50000,
      recoveryClass: 5,
      convention: 'half_year',
      placedInServiceDate: '2025-03-15',
      targetTaxYear: 2025,
    })
    expect(result.currentYearExpense).toBe(10000)
    expect(result.schedule[1].expense).toBe(16000)
    expect(result.schedule[5].ratePercent).toBe(5.76)
  })

  it('rejects non-US jurisdiction', () => {
    expect(() =>
      computeTaxDepreciation({
        cost: 1000,
        recoveryClass: 5,
        placedInServiceDate: '2025-01-01',
        targetTaxYear: 2025,
        jurisdiction: 'CA-provincial',
      }),
    ).toThrow(/US-federal/)
  })
})

describe('reconcile', () => {
  it('flags tax > book temporary difference', () => {
    const recon = reconcileBookTax(
      { currentYearExpense: 5000, assumptions: [] },
      { currentYearExpense: 10000, assumptions: [] },
      21,
    )
    expect(recon.temporaryDifference).toBe(5000)
    expect(recon.hint).toMatch(/DTL/)
  })
})
