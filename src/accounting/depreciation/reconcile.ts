import type { DepreciationResult, ReconciliationResult } from './types'
import { roundMoney } from './types'

export function reconcileBookTax(
  book: Pick<DepreciationResult, 'currentYearExpense' | 'assumptions'>,
  tax: Pick<DepreciationResult, 'currentYearExpense' | 'assumptions'>,
  statutoryRatePercent = 21,
): ReconciliationResult {
  const bookExpense = roundMoney(book.currentYearExpense)
  const taxExpense = roundMoney(tax.currentYearExpense)
  const temporaryDifference = roundMoney(taxExpense - bookExpense)
  const deferred = roundMoney(temporaryDifference * (statutoryRatePercent / 100))

  let hint: string
  if (Math.abs(temporaryDifference) < 0.005) {
    hint = 'No temporary difference for the selected year (book expense equals tax expense).'
  } else if (temporaryDifference > 0) {
    hint = `Tax depreciation exceeds book by ${temporaryDifference}. Informational DTL hint at ${statutoryRatePercent}%: ${deferred}. Not a full ASC 740 computation.`
  } else {
    hint = `Book depreciation exceeds tax by ${Math.abs(temporaryDifference)}. Informational DTA hint at ${statutoryRatePercent}%: ${Math.abs(deferred)}. Not a full ASC 740 computation.`
  }

  return {
    bookExpense,
    taxExpense,
    temporaryDifference,
    hint,
    assumptions: [
      'Book and tax kept separate; difference is temporary for depreciable PP&E (typical).',
      `Illustrative statutory rate ${statutoryRatePercent}% — confirm entity rate before booking deferred tax.`,
      'Full valuation allowance, rate changes, and intraperiod allocation are out of scope for this MVP.',
    ],
  }
}
