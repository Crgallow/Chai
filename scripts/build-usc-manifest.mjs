import fs from 'node:fs'
import path from 'node:path'

const titles = {
  '01': 'General Provisions',
  '02': 'The Congress',
  '03': 'The President',
  '04': 'Flag and Seal, Seat of Government, and the States',
  '05': 'Government Organization and Employees',
  '05A': 'Appendix — Government Organization and Employees',
  '06': 'Domestic Security',
  '07': 'Agriculture',
  '08': 'Aliens and Nationality',
  '09': 'Arbitration',
  '10': 'Armed Forces',
  '11': 'Bankruptcy',
  '11A': 'Appendix — Bankruptcy',
  '12': 'Banks and Banking',
  '13': 'Census',
  '14': 'Coast Guard',
  '15': 'Commerce and Trade',
  '16': 'Conservation',
  '17': 'Copyrights',
  '18': 'Crimes and Criminal Procedure',
  '18A': 'Appendix — Crimes and Criminal Procedure',
  '19': 'Customs Duties',
  '20': 'Education',
  '21': 'Food and Drugs',
  '22': 'Foreign Relations and Intercourse',
  '23': 'Highways',
  '24': 'Hospitals and Asylums',
  '25': 'Indians',
  '26': 'Internal Revenue Code',
  '27': 'Intoxicating Liquors',
  '28': 'Judiciary and Judicial Procedure',
  '28A': 'Appendix — Judiciary and Judicial Procedure',
  '29': 'Labor',
  '30': 'Mineral Lands and Mining',
  '31': 'Money and Finance',
  '32': 'National Guard',
  '33': 'Navigation and Navigable Waters',
  '34': 'Navy (as published in this download package)',
  '35': 'Patents',
  '36': 'Patriotic and National Observances, Ceremonies, and Organizations',
  '37': 'Pay and Allowances of the Uniformed Services',
  '38': "Veterans' Benefits",
  '39': 'Postal Service',
  '40': 'Public Buildings, Property, and Works',
  '41': 'Public Contracts',
  '42': 'The Public Health and Welfare',
  '43': 'Public Lands',
  '44': 'Public Printing and Documents',
  '45': 'Railroads',
  '46': 'Shipping',
  '47': 'Telecommunications',
  '48': 'Territories and Insular Possessions',
  '49': 'Transportation',
  '50': 'War and National Defense',
  '50A': 'Appendix — War and National Defense',
  '51': 'National and Commercial Space Programs',
  '52': 'Voting and Elections',
  '54': 'National Park Service and Related Programs',
}

const taxDir = 'authoritative-sources/tax'
const pdfs = fs.readdirSync(taxDir).filter((f) => f.endsWith('.pdf')).sort()

const macrs = {
  id: 'chai-public-macrs-half-year-note',
  file: 'tax/public-macrs-half-year-note.txt',
  publisher: 'IRS (public curriculum excerpt maintained by Chai)',
  title: 'Public note — MACRS half-year convention (demo / study)',
  description:
    'Short public-domain-style teaching excerpt for local research demos. Replace with full official publications you are licensed to host.',
  sourceType: 'authoritative',
  category: 'tax',
  authorityLevel: 'official_guidance',
  licensingStatus: 'public',
  jurisdiction: 'US-federal',
  taxYear: 2025,
  accountingFramework: 'TAX',
  topic: 'depreciation',
  subtopic: 'half-year convention',
  effectiveDate: '2025-01-01',
}

const sources = [macrs]
const unrecognized = []

for (const file of pdfs) {
  const m = file.match(/^usc([^@]+)@119-102\.pdf$/i)
  if (!m) {
    unrecognized.push(file)
    continue
  }
  const token = m[1]
  let titleKey = token
  let chapterNote = ''
  if (token.startsWith('42_')) {
    titleKey = '42'
    chapterNote = token.replace(/^42_/, '').replace(/_/g, ' ')
  }
  const name = titles[titleKey] || 'United States Code'
  const isIrc = titleKey === '26'
  const id = `usc-${token}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const title = chapterNote
    ? `United States Code Title 42 — ${name} (${chapterNote})`
    : `United States Code Title ${titleKey} — ${name}`

  /** @type {Record<string, unknown>} */
  const entry = {
    id,
    file: `tax/${file}`,
    publisher: 'United States Code (Office of the Law Revision Counsel)',
    title,
    description: isIrc
      ? 'Title 26 Internal Revenue Code (USC download package 119-102). Primary tax statute authority.'
      : 'Official United States Code title PDF from download package 119-102.',
    sourceType: 'authoritative',
    category: isIrc ? 'tax' : 'regulatory',
    authorityLevel: 'primary_authority',
    licensingStatus: 'public',
    jurisdiction: 'US-federal',
    topic: isIrc ? 'Internal Revenue Code' : `United States Code Title ${titleKey}`,
    sourceUrl: 'https://uscode.house.gov/download/download.shtml',
  }
  if (isIrc) {
    entry.accountingFramework = 'TAX'
    entry.taxYear = 2025
  }
  sources.push(entry)
}

if (unrecognized.length) {
  console.error('Unrecognized files:', unrecognized)
  process.exit(1)
}

const manifest = {
  version: 1,
  description:
    'Git-tracked authoritative corpus. USC title PDFs (package 119-102) plus curated notes.',
  sources,
}

fs.writeFileSync(
  path.join('authoritative-sources', 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(`Wrote ${sources.length} sources (${sources.length - 1} PDFs)`)
