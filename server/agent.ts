import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import {
  DEPRECIATION_TOOL_DEFINITIONS,
  executeTool,
  finalizeCitations,
  setDocumentSearchHandler,
  setKnowledgeResearchHandler,
} from '../src/accounting/tools.ts'
import type { Message, ModelId, StructuredAnswer } from '../src/types.ts'
import { searchDocuments } from './documents.ts'
import { runControlledResearch } from '../src/knowledge/researchPipeline.ts'
import { seedDemoKnowledgeIfEmpty } from '../src/knowledge/mock/seed.ts'

setDocumentSearchHandler(searchDocuments)
setKnowledgeResearchHandler(async (question) => {
  await seedDemoKnowledgeIfEmpty()
  const research = await runControlledResearch({ question, organizationId: 'platform', actor: 'agent' })
  return {
    conclusion: research.conclusion,
    explanation: research.explanation,
    unableToConclude: research.unableToConclude,
    requiresProfessionalReview: research.requiresProfessionalReview,
    usedMockRetrieval: research.usedMockRetrieval,
    usedOfficialResearch: research.usedOfficialResearch,
    officialResearchDisclosed: research.officialResearchDisclosed,
    confidence: research.confidence,
    warnings: research.warnings,
    factsReliedUpon: research.factsReliedUpon,
    assumptions: research.assumptions,
    missingInformation: research.missingInformation.map((m) => ({
      field: m.field,
      reason: m.reason,
    })),
    context: {
      category: research.context.category,
      applicableYear: research.context.applicableYear,
      jurisdiction: research.context.jurisdiction,
      accountingFramework: research.context.accountingFramework,
      auditFramework: research.context.auditFramework,
      bookOrTax: research.context.bookOrTax,
    },
    citations: research.citations,
    sourceSufficiency: {
      sufficient: research.sourceSufficiency.sufficient,
      score: research.sourceSufficiency.score,
      deficiencies: research.sourceSufficiency.deficiencies,
      reasons: research.sourceSufficiency.reasons,
      requiresHumanReview: research.sourceSufficiency.requiresHumanReview,
    },
  }
})

const SYSTEM_PROMPT = `You are Chai, a professional accounting assistant with Knowledge Governance.

Authority rules (mandatory):
1. Never treat unrestricted internet content, model memory, or unsupported conclusions as authoritative accounting guidance.
2. For accounting authority questions, call run_controlled_accounting_research first. It searches approved internal knowledge, evaluates sufficiency, and only then may use approved-domain official research (currently mock unless configured).
3. If research returns unableToConclude, tell the user clearly that sufficient authoritative support was not found — do not guess.
4. When official research was used, explicitly say that approved official websites were searched and label those sources as external.
5. User Files (search_documents) are organization materials — never present them as primary legal/professional authority.
6. Deterministic calculators must perform depreciation math and journal debit/credit validation.
7. Only cite quotes returned by tools. Never fabricate citations.
8. You are not a CPA.

Also available: compute_book_depreciation, compute_tax_depreciation, reconcile_book_tax, draft_journal_entry, lookup_authority, ask_missing_facts, search_documents.`

function mapModel(model: ModelId): string {
  if (model === 'chai-fast') return 'gpt-4o-mini'
  if (model === 'chai-deep') return 'gpt-4o'
  return 'gpt-4o-mini'
}

export interface AgentResult {
  content: string
  structured: StructuredAnswer
}

export async function runAccountingAgent(
  history: Message[],
  model: ModelId,
  signal?: AbortSignal,
): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      content:
        'The server is missing OPENAI_API_KEY. Add it to a local .env file (not the website). Restart the server after saving.',
      structured: {
        missingFacts: ['openai_api_key'],
        assumptions: ['Server has no OpenAI key configured — tools were not run.'],
      },
    }
  }

  const client = new OpenAI({ apiKey })
  const structured: StructuredAnswer = { toolTrace: [], assumptions: [], citationIds: [] }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const maxIters = 8
  for (let i = 0; i < maxIters; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const completion = await client.chat.completions.create(
      {
        model: mapModel(model),
        messages,
        tools: DEPRECIATION_TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.2,
      },
      { signal },
    )

    const choice = completion.choices[0]?.message
    if (!choice) throw new Error('Empty response from OpenAI')

    messages.push(choice)

    const toolCalls = choice.tool_calls
    if (!toolCalls?.length) {
      finalizeCitations(structured)
      const content =
        choice.content?.trim() ||
        'I could not produce a final answer. Try providing cost, placed-in-service date, tax year, and book vs tax scope.'
      return { content, structured }
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue
      const label = `${call.function.name}(${call.function.arguments.slice(0, 120)})`
      structured.toolTrace = [...(structured.toolTrace ?? []), label]
      const result = await executeTool(call.function.name, call.function.arguments, structured)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      })
    }
  }

  finalizeCitations(structured)
  return {
    content:
      'I hit the tool-call limit before finishing. Please retry with a more complete fact set (cost, PIS date, year, book/tax).',
    structured,
  }
}
