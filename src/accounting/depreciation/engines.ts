import { getMacrsRates } from './macrsTables'
import type {
  BookConvention,
  BookMethod,
  DepreciationResult,
  MacrsClass,
  ScheduleRow,
  TaxConvention,
} from './types'
import { roundMoney } from './types'

export interface BookDepreciationInput {
  cost: number
  salvage?: number
  usefulLifeYears: number
  method?: BookMethod
  decliningRate?: number
  convention?: BookConvention
  placedInServiceDate: string
  targetTaxYear: number
}

export interface TaxDepreciationInput {
  cost: number
  recoveryClass: MacrsClass
  convention?: TaxConvention
  placedInServiceDate: string
  targetTaxYear: number
  section179?: number
  bonusPercent?: number
  jurisdiction?: string
}

function parseDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) throw new Error('placedInServiceDate must be YYYY-MM-DD')
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function firstYearFraction(convention: BookConvention): number {
  if (convention === 'half_year') return 0.5
  if (convention === 'full_year' || convention === 'none') return 1
  return 1
}

export function computeBookDepreciation(input: BookDepreciationInput): DepreciationResult {
  const {
    cost,
    salvage = 0,
    usefulLifeYears,
    method = 'straight_line',
    decliningRate = 2,
    convention = 'half_year',
    placedInServiceDate,
    targetTaxYear,
  } = input

  if (!(cost > 0)) throw new Error('cost must be > 0')
  if (salvage < 0 || salvage >= cost) throw new Error('salvage must be >= 0 and < cost')
  if (!(usefulLifeYears > 0)) throw new Error('usefulLifeYears must be > 0')

  const pis = parseDate(placedInServiceDate)
  const depreciableBasis = roundMoney(cost - salvage)
  const assumptions: string[] = [
    `Book method: ${method === 'straight_line' ? 'straight-line' : `${decliningRate}× declining balance`}`,
    `Convention: ${convention}`,
    `Cost ${cost}, salvage ${salvage}, depreciable basis ${depreciableBasis}`,
    `Useful life ${usefulLifeYears} years`,
    `Placed in service ${placedInServiceDate}; target year ${targetTaxYear}`,
    'Book and tax treatments are computed separately.',
  ]

  const schedule: ScheduleRow[] = []
  let basis = cost
  let accumulated = 0
  const annualSL = roundMoney(depreciableBasis / usefulLifeYears)

  if (method === 'straight_line') {
    let remaining = depreciableBasis
    const yearsNeeded = convention === 'half_year' ? usefulLifeYears + 1 : usefulLifeYears
    for (let i = 0; i < yearsNeeded; i++) {
      const taxYear = pis.year + i
      let expense = annualSL
      if (convention === 'half_year') {
        if (i === 0) expense = roundMoney(annualSL * firstYearFraction(convention))
        else if (i === usefulLifeYears) expense = roundMoney(annualSL * 0.5)
      }
      expense = roundMoney(Math.min(expense, remaining))
      remaining = roundMoney(remaining - expense)
      accumulated = roundMoney(accumulated + expense)
      basis = roundMoney(cost - accumulated)
      schedule.push({
        yearIndex: i + 1,
        taxYear,
        expense,
        accumulated,
        endingBasis: Math.max(basis, salvage),
      })
      if (remaining <= 0) break
    }
  } else {
    // Declining balance switching conceptually to SL residual not fully modeled; MVP DB to salvage floor
    const rate = decliningRate / usefulLifeYears
    let i = 0
    while (accumulated < depreciableBasis - 0.005 && i < usefulLifeYears + 2) {
      const taxYear = pis.year + i
      let raw = basis * rate
      if (i === 0 && convention === 'half_year') raw *= 0.5
      let expense = roundMoney(Math.min(raw, basis - salvage))
      if (expense < 0) expense = 0
      accumulated = roundMoney(accumulated + expense)
      basis = roundMoney(basis - expense)
      schedule.push({
        yearIndex: i + 1,
        taxYear,
        expense,
        accumulated,
        endingBasis: basis,
        ratePercent: roundMoney(rate * 100 * (i === 0 && convention === 'half_year' ? 0.5 : 1)),
      })
      i++
      if (expense === 0) break
    }
  }

  const yearRow = schedule.find((r) => r.taxYear === targetTaxYear)
  const currentYearExpense = yearRow?.expense ?? 0
  const remainingBasis = yearRow?.endingBasis ?? schedule.at(-1)?.endingBasis ?? cost

  const sumExpense = roundMoney(schedule.reduce((s, r) => s + r.expense, 0))
  const validations: string[] = []
  if (method === 'straight_line') {
    const delta = Math.abs(sumExpense - depreciableBasis)
    if (delta > 0.05) {
      validations.push(`Schedule sum ${sumExpense} differs from depreciable basis ${depreciableBasis} by ${delta}`)
    } else {
      validations.push(`Schedule sums to depreciable basis (${sumExpense}).`)
    }
  } else {
    validations.push(`Accumulated book depreciation ${sumExpense}; floor at salvage ${salvage}.`)
  }
  if (!yearRow) {
    validations.push(`No depreciation in target year ${targetTaxYear} under given PIS date/life.`)
  }

  return {
    kind: 'book',
    methodLabel: method === 'straight_line' ? 'Book straight-line' : 'Book declining balance',
    cost,
    depreciableBasis,
    currentYearExpense,
    remainingBasis,
    schedule,
    assumptions,
    validations,
    citationIds: ['ASC-360-10-PPE', 'BOOK-SL-CONVENTION'],
  }
}

export function computeTaxDepreciation(input: TaxDepreciationInput): DepreciationResult {
  const {
    cost,
    recoveryClass,
    convention = 'half_year',
    placedInServiceDate,
    targetTaxYear,
    section179 = 0,
    bonusPercent = 0,
    jurisdiction = 'US-federal',
  } = input

  if (!(cost > 0)) throw new Error('cost must be > 0')
  if (section179 < 0 || section179 > cost) throw new Error('section179 out of range')
  if (bonusPercent < 0 || bonusPercent > 100) throw new Error('bonusPercent must be 0–100')
  if (jurisdiction !== 'US-federal') {
    throw new Error(`Jurisdiction ${jurisdiction} not supported in MVP; use US-federal.`)
  }

  const pis = parseDate(placedInServiceDate)
  const after179 = roundMoney(cost - section179)
  const bonus = roundMoney(after179 * (bonusPercent / 100))
  const macrsBasis = roundMoney(after179 - bonus)
  const rates = getMacrsRates(recoveryClass, convention, pis.month)

  const assumptions: string[] = [
    `Jurisdiction: ${jurisdiction}`,
    `MACRS GDS ${recoveryClass}-year property`,
    `Convention: ${convention}`,
    `Unadjusted basis (cost) ${cost}`,
    section179 > 0 ? `Section 179 expense ${section179}` : 'Section 179: none',
    bonusPercent > 0 ? `Bonus depreciation ${bonusPercent}% = ${bonus}` : 'Bonus depreciation: none',
    `MACRS depreciable basis ${macrsBasis}`,
    `Placed in service ${placedInServiceDate}; recovery year mapped from PIS calendar year`,
    'Tax depreciation uses IRS Pub 946 percentage tables — not model arithmetic.',
  ]

  const schedule: ScheduleRow[] = []
  let accumulated = roundMoney(section179 + bonus)
  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i]
    const expense = roundMoney(macrsBasis * (rate / 100))
    accumulated = roundMoney(accumulated + expense)
    const endingBasis = roundMoney(cost - accumulated)
    schedule.push({
      yearIndex: i + 1,
      taxYear: pis.year + i,
      expense: i === 0 ? roundMoney(expense + section179 + bonus) : expense,
      accumulated,
      endingBasis: Math.max(0, endingBasis),
      ratePercent: rate,
    })
  }

  // First-year schedule row already includes 179+bonus in expense for current-year reporting
  const yearRow = schedule.find((r) => r.taxYear === targetTaxYear)
  const currentYearExpense = yearRow?.expense ?? 0
  const remainingBasis = yearRow?.endingBasis ?? schedule.at(-1)?.endingBasis ?? 0

  const macrsOnlySum = roundMoney(schedule.reduce((s, r, idx) => {
    const macrsPart = idx === 0 ? roundMoney(r.expense - section179 - bonus) : r.expense
    return s + macrsPart
  }, 0))
  const validations: string[] = []
  const delta = Math.abs(macrsOnlySum - macrsBasis)
  if (delta > 0.5) {
    validations.push(`MACRS % sum applied ${macrsOnlySum} vs basis ${macrsBasis} (delta ${delta})`)
  } else {
    validations.push(`MACRS percentages applied to basis ${macrsBasis}; schedule cross-checks within tolerance.`)
  }
  if (!yearRow) {
    validations.push(`No MACRS depreciation in target year ${targetTaxYear}.`)
  }

  const citationIds =
    convention === 'half_year'
      ? ['IRS-PUB-946', 'IRS-MACRS-A1-HY', `IRS-MACRS-${recoveryClass}YR`]
      : ['IRS-PUB-946', 'IRS-MACRS-MQ', `IRS-MACRS-${recoveryClass}YR`]

  return {
    kind: 'tax',
    methodLabel: `MACRS GDS ${recoveryClass}-yr (${convention})`,
    cost,
    depreciableBasis: macrsBasis,
    currentYearExpense,
    remainingBasis,
    schedule,
    assumptions,
    validations,
    citationIds,
  }
}
