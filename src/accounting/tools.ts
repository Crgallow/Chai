import {
  computeBookDepreciation,
  computeTaxDepreciation,
  reconcileBookTax,
  type BookConvention,
  type BookMethod,
  type MacrsClass,
  type TaxConvention,
} from './depreciation'
import { buildJournalEntry } from './journal/entry'
import { getAuthorityByIds, lookupAuthority } from './authority/corpus'
import type { StructuredAnswer, ScheduleView } from '../types'

/** Filled by the server agent so browser code does not import Node document store. */
let searchUploadedDocuments:
  | ((query: string, limit?: number) => Promise<
      { filename: string; quote: string; score: number; chunkIndex: number; documentId: string }[]
    >)
  | null = null

let runKnowledgeResearch:
  | ((question: string) => Promise<import('../types').AccountingResearchView>)
  | null = null

export function setDocumentSearchHandler(
  handler: NonNullable<typeof searchUploadedDocuments>,
): void {
  searchUploadedDocuments = handler
}

export function setKnowledgeResearchHandler(
  handler: NonNullable<typeof runKnowledgeResearch>,
): void {
  runKnowledgeResearch = handler
}

export const DEPRECIATION_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'ask_missing_facts',
      description:
        'Call when material facts are missing before computing depreciation. Returns a structured checklist for the user.',
      parameters: {
        type: 'object',
        properties: {
          known: { type: 'object', additionalProperties: { type: 'string' } },
          missing: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Missing items such as jurisdiction, tax_year, book_vs_tax, cost, placed_in_service_date, recovery_class, book_method, convention',
          },
          message: { type: 'string' },
        },
        required: ['missing', 'message'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compute_book_depreciation',
      description:
        'Compute book (GAAP/policy) depreciation using tested code. Do not calculate depreciation yourself.',
      parameters: {
        type: 'object',
        properties: {
          cost: { type: 'number' },
          salvage: { type: 'number' },
          usefulLifeYears: { type: 'number' },
          method: { type: 'string', enum: ['straight_line', 'declining_balance'] },
          decliningRate: { type: 'number' },
          convention: { type: 'string', enum: ['full_year', 'half_year', 'none'] },
          placedInServiceDate: { type: 'string', description: 'YYYY-MM-DD' },
          targetTaxYear: { type: 'number' },
        },
        required: ['cost', 'usefulLifeYears', 'placedInServiceDate', 'targetTaxYear'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compute_tax_depreciation',
      description:
        'Compute US federal MACRS tax depreciation using IRS Pub 946 percentage tables in code.',
      parameters: {
        type: 'object',
        properties: {
          cost: { type: 'number' },
          recoveryClass: { type: 'number', enum: [3, 5, 7, 10, 15, 20] },
          convention: { type: 'string', enum: ['half_year', 'mid_quarter'] },
          placedInServiceDate: { type: 'string' },
          targetTaxYear: { type: 'number' },
          section179: { type: 'number' },
          bonusPercent: { type: 'number' },
          jurisdiction: { type: 'string', description: 'Must be US-federal for MVP' },
        },
        required: ['cost', 'recoveryClass', 'placedInServiceDate', 'targetTaxYear'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reconcile_book_tax',
      description:
        'Compare book vs tax current-year depreciation and return temporary difference + informational DTA/DTL hint.',
      parameters: {
        type: 'object',
        properties: {
          bookCurrentYearExpense: { type: 'number' },
          taxCurrentYearExpense: { type: 'number' },
          statutoryRatePercent: { type: 'number' },
        },
        required: ['bookCurrentYearExpense', 'taxCurrentYearExpense'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'draft_journal_entry',
      description:
        'Build and validate a journal entry. Debits must equal credits. Use after amounts are known from calculators or the user. Never skip this tool when presenting journal entries.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD when known' },
          memo: { type: 'string' },
          purpose: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                account: { type: 'string' },
                debit: { type: 'number' },
                credit: { type: 'number' },
                memo: { type: 'string' },
              },
              required: ['account'],
            },
          },
        },
        required: ['lines'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_controlled_accounting_research',
      description:
        'Run Chai Knowledge Governance research: classify context, search approved internal sources, evaluate sufficiency, optionally search approved official domains (mock by default). Use for accounting authority questions. Never invent citations.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_documents',
      description:
        'Semantically search the user\'s uploaded files for relevant passages. Returns verbatim quotes to cite. Call this whenever the question may be answered from uploaded policies, workpapers, COA, or docs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_authority',
      description:
        'Search the curated local authority corpus (IRS Pub 946 / MACRS / ASC summaries). Only cite returned IDs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
]

function toScheduleView(
  label: string,
  kind: 'book' | 'tax',
  result: ReturnType<typeof computeBookDepreciation>,
): ScheduleView {
  return {
    label,
    kind,
    currentYearExpense: result.currentYearExpense,
    remainingBasis: result.remainingBasis,
    rows: result.schedule.map((r) => ({
      yearIndex: r.yearIndex,
      taxYear: r.taxYear,
      expense: r.expense,
      accumulated: r.accumulated,
      endingBasis: r.endingBasis,
      ratePercent: r.ratePercent,
    })),
    validations: result.validations,
  }
}

export async function executeTool(
  name: string,
  argsJson: string,
  structured: StructuredAnswer,
): Promise<string> {
  try {
    const args = argsJson ? JSON.parse(argsJson) : {}
    switch (name) {
      case 'ask_missing_facts': {
        const missing = (args.missing as string[]) ?? []
        structured.missingFacts = [...new Set([...(structured.missingFacts ?? []), ...missing])]
        return JSON.stringify({
          status: 'need_user_input',
          missing,
          known: args.known ?? {},
          message: args.message,
        })
      }
      case 'compute_book_depreciation': {
        const result = computeBookDepreciation({
          cost: Number(args.cost),
          salvage: args.salvage != null ? Number(args.salvage) : 0,
          usefulLifeYears: Number(args.usefulLifeYears),
          method: (args.method as BookMethod) ?? 'straight_line',
          decliningRate: args.decliningRate != null ? Number(args.decliningRate) : 2,
          convention: (args.convention as BookConvention) ?? 'half_year',
          placedInServiceDate: String(args.placedInServiceDate),
          targetTaxYear: Number(args.targetTaxYear),
        })
        structured.assumptions = [...(structured.assumptions ?? []), ...result.assumptions]
        structured.schedules = [
          ...(structured.schedules ?? []),
          toScheduleView(result.methodLabel, 'book', result),
        ]
        structured.citationIds = [...new Set([...(structured.citationIds ?? []), ...result.citationIds])]
        return JSON.stringify(result)
      }
      case 'compute_tax_depreciation': {
        const result = computeTaxDepreciation({
          cost: Number(args.cost),
          recoveryClass: Number(args.recoveryClass) as MacrsClass,
          convention: (args.convention as TaxConvention) ?? 'half_year',
          placedInServiceDate: String(args.placedInServiceDate),
          targetTaxYear: Number(args.targetTaxYear),
          section179: args.section179 != null ? Number(args.section179) : 0,
          bonusPercent: args.bonusPercent != null ? Number(args.bonusPercent) : 0,
          jurisdiction: args.jurisdiction ? String(args.jurisdiction) : 'US-federal',
        })
        structured.assumptions = [...(structured.assumptions ?? []), ...result.assumptions]
        structured.schedules = [
          ...(structured.schedules ?? []),
          toScheduleView(result.methodLabel, 'tax', result),
        ]
        structured.citationIds = [...new Set([...(structured.citationIds ?? []), ...result.citationIds])]
        return JSON.stringify(result)
      }
      case 'reconcile_book_tax': {
        const recon = reconcileBookTax(
          { currentYearExpense: Number(args.bookCurrentYearExpense), assumptions: [] },
          { currentYearExpense: Number(args.taxCurrentYearExpense), assumptions: [] },
          args.statutoryRatePercent != null ? Number(args.statutoryRatePercent) : 21,
        )
        structured.reconciliation = recon
        structured.assumptions = [...(structured.assumptions ?? []), ...recon.assumptions]
        structured.citationIds = [...new Set([...(structured.citationIds ?? []), 'ASC-740-TEMP-DIFF-HINT'])]
        return JSON.stringify(recon)
      }
      case 'draft_journal_entry': {
        const entry = buildJournalEntry({
          date: args.date ? String(args.date) : undefined,
          memo: args.memo ? String(args.memo) : undefined,
          purpose: args.purpose ? String(args.purpose) : undefined,
          lines: Array.isArray(args.lines) ? args.lines : [],
        })
        structured.assumptions = [...(structured.assumptions ?? []), ...entry.assumptions]
        structured.journalEntries = [
          ...(structured.journalEntries ?? []),
          {
            date: entry.date,
            memo: entry.memo,
            lines: entry.lines,
            totalDebits: entry.totalDebits,
            totalCredits: entry.totalCredits,
            balanced: entry.balanced,
            validations: entry.validations,
          },
        ]
        if (!entry.balanced) {
          return JSON.stringify({
            ...entry,
            error: 'Journal entry is out of balance. Fix lines before presenting as postable.',
          })
        }
        return JSON.stringify(entry)
      }
      case 'run_controlled_accounting_research': {
        if (!runKnowledgeResearch) {
          return JSON.stringify({ error: 'Knowledge research unavailable on this runtime.' })
        }
        const research = await runKnowledgeResearch(String(args.question ?? ''))
        structured.research = research
        if (research.unableToConclude) {
          structured.missingFacts = [
            ...(structured.missingFacts ?? []),
            ...research.missingInformation.map((m) => m.field),
          ]
        }
        if (research.usedOfficialResearch) {
          structured.webSearchUsed = true
          structured.webCitations = research.citations
            .filter((c) => c.internalOrExternal === 'external' && c.sourceUrl)
            .map((c) => ({
              title: c.title,
              url: c.sourceUrl!,
              snippet: c.quotedText,
              demoData: c.demoData,
            }))
        }
        structured.documentQuotes = [
          ...(structured.documentQuotes ?? []),
          ...research.citations
            .filter((c) => c.quotedText)
            .map((c, i) => ({
              filename: c.title,
              quote: c.quotedText || '',
              score: research.sourceSufficiency.score,
              chunkIndex: i,
              source:
                c.internalOrExternal === 'external'
                  ? ('official' as const)
                  : ('knowledge' as const),
            })),
        ]
        structured.assumptions = [
          ...(structured.assumptions ?? []),
          ...research.assumptions,
          ...research.warnings,
        ]
        return JSON.stringify(research)
      }
      case 'search_documents': {
        if (!searchUploadedDocuments) {
          return JSON.stringify({
            error: 'Document search is only available on the server.',
            hits: [],
          })
        }
        const hits = await searchUploadedDocuments(String(args.query ?? ''), Number(args.limit ?? 5))
        structured.documentQuotes = [
          ...(structured.documentQuotes ?? []),
          ...hits.map((h) => ({
            filename: h.filename,
            quote: h.quote,
            score: h.score,
            chunkIndex: h.chunkIndex,
          })),
        ]
        return JSON.stringify({
          hitCount: hits.length,
          hits: hits.map((h) => ({
            filename: h.filename,
            chunkIndex: h.chunkIndex,
            score: Number(h.score.toFixed(4)),
            quote: h.quote,
          })),
        })
      }
      case 'lookup_authority': {
        const docs = lookupAuthority(String(args.query ?? ''), Number(args.limit ?? 5))
        structured.citationIds = [...new Set([...(structured.citationIds ?? []), ...docs.map((d) => d.id)])]
        return JSON.stringify(docs)
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
  }
}

export function finalizeCitations(structured: StructuredAnswer): void {
  if (!structured.citationIds?.length) return
  structured.citations = getAuthorityByIds(structured.citationIds).map((d) => ({
    id: d.id,
    title: d.title,
    source: d.source,
    url: d.url,
    excerpt: d.excerpt,
  }))
}
