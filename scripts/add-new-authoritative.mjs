import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'authoritative-sources'
const MANIFEST_PATH = path.join(ROOT, 'manifest.json')

function slugId(fileRel, prefix) {
  const base = path.basename(fileRel, path.extname(fileRel))
  return (
    `${prefix}-` +
    base
      .toLowerCase()
      .replace(/\(rev\.[^)]*\)/gi, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  )
}

function metaFor(rel) {
  const top = rel.split('/')[0]
  const name = path.basename(rel)
  if (top === 'audit' || /pcaob|as\s+\d+/i.test(name)) {
    const asMatch = name.match(/AS\s+(\d+)/i)
    if (asMatch) {
      return {
        prefix: 'pcaob',
        publisher: 'PCAOB',
        category: 'audit',
        authorityLevel: 'professional_standard',
        auditFramework: 'PCAOB',
        topic: 'PCAOB Auditing Standards',
        subtopic: `AS ${asMatch[1]}`,
        sourceUrl: 'https://pcaobus.org/oversight/standards/auditing-standards',
      }
    }
    return {
      prefix: 'audit',
      publisher: /au-c|aicpa/i.test(name) ? 'AICPA' : 'PCAOB',
      category: 'audit',
      authorityLevel: 'professional_standard',
      auditFramework: /au-c|aicpa/i.test(name) ? 'AICPA' : 'PCAOB',
      topic: 'auditing standards',
      sourceUrl: 'https://pcaobus.org/',
    }
  }
  if (top === 'financial-accounting') {
    return {
      prefix: 'fa',
      publisher: 'FASB / SEC',
      category: 'financial_accounting',
      authorityLevel: 'primary_authority',
      accountingFramework: 'US_GAAP',
      topic: 'financial accounting',
      sourceUrl: 'https://www.fasb.org/',
    }
  }
  return {
    prefix: 'irs',
    publisher: 'IRS',
    category: 'tax',
    authorityLevel: 'official_guidance',
    accountingFramework: 'TAX',
    topic: topicFor(name),
    sourceUrl: 'https://www.irs.gov/forms-instructions',
  }
}


function titleFor(fileRel) {
  const base = path.basename(fileRel, path.extname(fileRel))
  // Keep IRS-ish naming readable
  return base
    .replace(/\s+/g, ' ')
    .replace(/Form 4547Form 4547/i, 'Form 4547')
    .trim()
}

function topicFor(name) {
  const n = name.toLowerCase()
  if (n.includes('w-2') || n.includes('w-3')) return 'wage reporting'
  if (n.includes('w-4')) return 'withholding'
  if (n.includes('w-7')) return 'ITIN'
  if (n.includes('w-9')) return 'taxpayer identification'
  if (n.includes('1040-es')) return 'estimated tax'
  if (n.includes('1040')) return 'individual income tax return'
  if (n.includes('941')) return 'employment tax'
  if (n.includes('2848')) return 'power of attorney'
  if (n.includes('4506')) return 'tax return transcript request'
  if (n.includes('4547')) return 'IRS account access'
  if (n.includes('9465')) return 'installment agreement'
  if (n.includes('ss-4')) return 'EIN application'
  return 'IRS forms and instructions'
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const listed = new Set(manifest.sources.map((s) => s.file.replace(/\\/g, '/')))
const usedIds = new Set(manifest.sources.map((s) => s.id))

const diskFiles = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full)
    else if (/\.(pdf|docx|txt|md|csv|xlsx)$/i.test(ent.name) && ent.name !== 'README.md') {
      diskFiles.push(full)
    }
  }
}
walk(ROOT)

const added = []
for (const full of diskFiles.sort()) {
  const rel = path.relative(ROOT, full).split(path.sep).join('/')
  if (listed.has(rel)) continue
  const meta = metaFor(rel)
  let id = slugId(rel, meta.prefix)
  if (usedIds.has(id)) {
    let i = 2
    while (usedIds.has(`${id}-${i}`)) i += 1
    id = `${id}-${i}`
  }
  usedIds.add(id)
  const name = path.basename(rel)
  const entry = {
    id,
    file: rel,
    publisher: meta.publisher,
    title: titleFor(rel),
    description: `${meta.publisher} document (${name}).`,
    sourceType: 'authoritative',
    category: meta.category,
    authorityLevel: meta.authorityLevel,
    licensingStatus: 'public',
    jurisdiction: 'US-federal',
    topic: meta.topic,
    sourceUrl: meta.sourceUrl,
  }
  if (meta.accountingFramework) entry.accountingFramework = meta.accountingFramework
  if (meta.auditFramework) entry.auditFramework = meta.auditFramework
  if (meta.subtopic) entry.subtopic = meta.subtopic
  manifest.sources.push(entry)
  added.push(entry.id)
}

manifest.description =
  'Git-tracked authoritative corpus. USC titles, IRS forms/pubs, PCAOB/AICPA audit standards, plus curated notes.'

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Added ${added.length} sources; total ${manifest.sources.length}`)
for (const id of added) console.log(' +', id)
