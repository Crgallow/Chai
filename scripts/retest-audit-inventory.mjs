import { MockAccountingResearchOrchestrator } from '../server/research/orchestrator.ts'
import { classifyResearchContext } from '../src/knowledge/sufficiency/engine.ts'
import {
  evaluateIssueCoverage,
  extractStandardSectionLabel,
  inferAuditFramework,
  isIrrelevantStatuteForAudit,
  parseAuditQuestion,
  summarizeAuthorityUsage,
} from '../src/knowledge/auditResearch.ts'
import { runControlledResearch } from '../src/knowledge/researchPipeline.ts'

const question = `You are auditing a privately held manufacturing company under U.S. GAAS for the year ended December 31, 2025. Inventory represents 38% of total assets. The auditor did not attend the year-end physical inventory count because the client failed to notify the audit team of the count date. The client has perpetual inventory records, count sheets, purchase invoices and subsequent sales records. Management refuses to perform another physical count. What procedures should the auditor perform? If sufficient appropriate audit evidence cannot be obtained, what effect should this have on the auditor’s opinion? Identify and cite the applicable AU-C standards, and explain whether the answer would change if the company were a public company audited under PCAOB standards.`

const fw = inferAuditFramework(question)
const parsed = parseAuditQuestion(question)
const ctx = classifyResearchContext(question)

console.log('=== PARSE ===')
console.log(JSON.stringify({ fw, parsed: { ...parsed, materialFacts: parsed?.materialFacts }, ctx }, null, 2))

process.env.CHAI_USE_MOCK_OFFICIAL = '0'
if (!parsed) {
  console.error('parseAuditQuestion returned null')
  process.exit(1)
}

const research = await runControlledResearch({
  question,
  organizationId: 'platform',
  actor: 'retest',
  contextOverride: {
    category: 'audit',
    topic: 'inventory observation',
    applicableYear: 2025,
    jurisdiction: 'US-federal',
    auditFramework: 'AICPA',
    entityType: 'nonissuer',
    publicPrivateApplicability: 'private',
    bookOrTax: 'unknown',
    missingInformation: [],
  },
})

const usc = research.citations.filter((c) =>
  isIrrelevantStatuteForAudit({
    question,
    sourceTitle: c.title,
    publisher: c.publisher,
    category: 'audit',
  }),
)
const internal = research.citations.filter((c) => c.internalOrExternal === 'internal')
const external = research.citations.filter((c) => c.internalOrExternal === 'external')

const coverage = evaluateIssueCoverage({
  parsed,
  passages: research.citations.map((c) => ({
    text: `${c.section || ''} ${c.quotedText || ''}`,
    internal: c.internalOrExternal === 'internal',
    title: c.title,
    publisher: c.publisher,
  })),
})
const usage = summarizeAuthorityUsage({
  citations: research.citations,
  issueCoverage: coverage,
  websitesSearched: research.usedOfficialResearch
    ? ['aicpa-cima.com', 'pcaobus.org'].filter((s) =>
        (research.explanation || '').toLowerCase().includes(s.split('.')[0]),
      )
    : [],
})

console.log('\n=== RETRIEVAL / USAGE ===')
console.log('auditFramework', research.context.auditFramework)
console.log('Documents used:', usage.documentsUsed)
console.log('Standards/frameworks used:', usage.frameworks)
console.log('Authoritative sections used:', usage.sectionsUsed, usage.sectionLabels.slice(0, 15))
console.log('Supporting passages used:', usage.passagesUsed)
console.log('Issues supported internally:', usage.issuesSupportedInternally)
console.log('Issues needing internet / unresolved:', usage.issuesNeedingInternet)
console.log('Official websites searched:', usage.websitesSearched.length ? usage.websitesSearched : 'none')
console.log('usedOfficialResearch', research.usedOfficialResearch)
console.log('irrelevantUscCount', usc.length)
console.log(
  'internal docs',
  [...new Set(internal.map((c) => c.title))],
)
console.log(
  'passages',
  internal.slice(0, 12).map((c) => ({
    title: c.title.slice(0, 40),
    section: extractStandardSectionLabel(c.quotedText || '', c.section) || c.section,
    page: c.page,
  })),
)
console.log(
  'external',
  external.map((c) => `${c.publisher}: ${c.title}`),
)

const orch = new MockAccountingResearchOrchestrator()
const result = await orch.research({
  question,
  conversationId: 'retest',
  userId: 'retest',
  responseMode: 'professional',
  uploadedDocumentIds: [],
  knownContext: {
    country: 'US',
    jurisdiction: 'US-federal',
    applicableYear: 2025,
  },
})

console.log('\n=== ANSWER (excerpt) ===')
console.log(result.content.slice(0, 3200))
console.log('\n=== CHECKS ===')
console.log('mentions AICPA/GAAS primary', /AICPA U\.S\. GAAS|AU-C|primary framework is AICPA/i.test(result.content))
console.log('mentions PCAOB comparison', /PCAOB comparison|separate comparison/i.test(result.content))
console.log('mentions alternative procedures', /alternative procedure/i.test(result.content))
console.log('mentions qualified', /qualified/i.test(result.content))
console.log('mentions disclaimer', /disclaimer/i.test(result.content))
console.log('documents used line', /Documents used:/i.test(result.content))
console.log('not template conclusion', !/^Identify the applicable audit assertion/m.test(result.content))
console.log('research path disclosed', /Research path:/i.test(result.content))
console.log('no internet when internal sufficient', !research.usedOfficialResearch || /PCAOB website|official/i.test(result.content))
console.log(
  'primary sources',
  result.primarySources.map((s) => s.title).slice(0, 8),
)
console.log('confidence', result.answer.evidenceConfidence?.score)
console.log('confidence reasons', result.answer.evidenceConfidence?.reasons?.slice(0, 10))
