import type { MacrsClass, TaxConvention } from './types'

/**
 * IRS Publication 946 Appendix A — MACRS Percentage Table Guide
 * Table A-1: General Depreciation System (GDS) / Half-Year Convention
 * Rates are percentages of unadjusted depreciable basis.
 */
export const MACRS_HALF_YEAR: Record<MacrsClass, number[]> = {
  3: [33.33, 44.45, 14.81, 7.41],
  5: [20.0, 32.0, 19.2, 11.52, 11.52, 5.76],
  7: [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
  10: [10.0, 18.0, 14.4, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28],
  15: [5.0, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95],
  20: [
    3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461,
    4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231,
  ],
}

/**
 * Mid-quarter convention tables (simplified GDS personal property).
 * Quarter is 1–4 based on month placed in service.
 * Source pattern: IRS Pub 946 Tables A-2 through A-5 (excerpted for MVP classes 3/5/7).
 */
export const MACRS_MID_QUARTER: Record<1 | 2 | 3 | 4, Partial<Record<MacrsClass, number[]>>> = {
  1: {
    3: [58.33, 27.78, 12.35, 1.54],
    5: [35.0, 26.0, 15.6, 11.01, 11.01, 1.38],
    7: [25.0, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09],
  },
  2: {
    3: [41.67, 38.89, 14.14, 5.3],
    5: [25.0, 30.0, 18.0, 11.37, 11.37, 4.26],
    7: [17.85, 23.47, 16.76, 11.97, 8.87, 8.87, 8.87, 3.34],
  },
  3: {
    3: [25.0, 50.0, 16.67, 8.33],
    5: [15.0, 34.0, 20.4, 12.24, 11.3, 7.06],
    7: [10.71, 25.51, 18.22, 13.02, 9.3, 8.85, 8.86, 5.53],
  },
  4: {
    3: [8.33, 61.11, 20.37, 10.19],
    5: [5.0, 38.0, 22.8, 13.68, 10.94, 9.58],
    7: [3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64],
  },
}

export function quarterFromMonth(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

export function getMacrsRates(
  recoveryClass: MacrsClass,
  convention: TaxConvention,
  placedInServiceMonth: number,
): number[] {
  if (convention === 'half_year') {
    return MACRS_HALF_YEAR[recoveryClass]
  }
  const q = quarterFromMonth(placedInServiceMonth)
  const rates = MACRS_MID_QUARTER[q][recoveryClass]
  if (!rates) {
    throw new Error(
      `Mid-quarter MACRS table not available in MVP for class ${recoveryClass}-year (Q${q}). Use half-year or class 3/5/7.`,
    )
  }
  return rates
}
