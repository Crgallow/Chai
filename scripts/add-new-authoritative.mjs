import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'authoritative-sources'
const MANIFEST_PATH = path.join(ROOT, 'manifest.json')

function slugId(fileRel) {
  const base = path.basename(fileRel, path.extname(fileRel))
  return (
    'irs-' +
    base
      .toLowerCase()
      .replace(/\(rev\.[^)]*\)/gi, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  )
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
  let id = slugId(rel)
  if (usedIds.has(id)) {
    let i = 2
    while (usedIds.has(`${id}-${i}`)) i += 1
    id = `${id}-${i}`
  }
  usedIds.add(id)
  const name = path.basename(rel)
  const isInstructions = /instruc/i.test(name)
  const entry = {
    id,
    file: rel,
    publisher: 'IRS',
    title: titleFor(rel),
    description: isInstructions
      ? `IRS instructions PDF (${name}).`
      : `IRS form/publication PDF (${name}).`,
    sourceType: 'authoritative',
    category: 'tax',
    authorityLevel: 'official_guidance',
    licensingStatus: 'public',
    jurisdiction: 'US-federal',
    accountingFramework: 'TAX',
    topic: topicFor(name),
    sourceUrl: 'https://www.irs.gov/forms-instructions',
  }
  manifest.sources.push(entry)
  added.push(entry.id)
}

manifest.description =
  'Git-tracked authoritative corpus. USC titles, IRS Pub 17, IRS forms/instructions, plus curated notes.'

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Added ${added.length} sources; total ${manifest.sources.length}`)
for (const id of added) console.log(' +', id)
