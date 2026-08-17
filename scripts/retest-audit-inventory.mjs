import { MockAccountingResearchOrchestrator } from '../server/research/orchestrator.ts'
import { classifyResearchContext } from '../src/knowledge/sufficiency/engine.ts'
import {
  inferAuditFramework,
  parseAuditQuestion,
  isIrrelevantStatuteForAudit,
} from '../src/knowledge/auditResearch.ts'
import { runControlledResearch } from '../src/knowledge/researchPipeline.ts'

const question = `You are auditing a privately held manufacturing company under U.S. GAAS for the year ended December 31, 2025. Inventory represents 38% of total assets. The auditor did not attend the year-end physical inventory count because the client failed to notify the audit team of the count date. The client has perpetual inventory records, count sheets, purchase invoices and subsequent sales records. Management refuses to perform another physical count. What procedures should the auditor perform? If sufficient appropriate audit evidence cannot be obtained, what effect should this have on the auditor’s opinion? Identify and cite the applicable AU-C standards, and explain whether the answer would change if the company were a public company audited under PCAOB standards.`

const fw = inferAuditFramework(question)
const parsed = parseAuditQuestion(question)
const ctx = classifyResearchContext(question)

console.log('=== PARSE ===')
console.log(JSON.stringify({ fw, parsed, ctx }, null, 2))

process.env.CHAI_USE_MOCK_OFFICIAL = '1'
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

console.log('\n=== RETRIEVAL ===')
console.log('auditFramework', research.context.auditFramework)
console.log('citationCount', research.citations.length)
console.log('irrelevantUscCount', usc.length)
console.log(
  'internal',
  internal.map((c) => `${c.publisher}: ${c.title}`),
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
console.log(result.content.slice(0, 2500))
console.log('\n=== CHECKS ===')
console.log('mentions AICPA/GAAS primary', /AICPA U\.S\. GAAS|AU-C|primary framework is AICPA/i.test(result.content))
console.log('mentions PCAOB comparison', /PCAOB comparison|separate comparison/i.test(result.content))
console.log('mentions alternative procedures', /alternative procedure/i.test(result.content))
console.log('mentions qualified', /qualified/i.test(result.content))
console.log('mentions disclaimer', /disclaimer/i.test(result.content))
console.log('not template conclusion', !/^Identify the applicable audit assertion/m.test(result.content))
console.log('research path disclosed', /Research path:/i.test(result.content))
console.log(
  'primary sources',
  result.primarySources.map((s) => s.title).slice(0, 8),
)
console.log('confidence', result.answer.evidenceConfidence?.score, result.answer.evidenceConfidence?.reasons?.slice(0, 6))
