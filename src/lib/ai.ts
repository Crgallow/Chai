import type { Message, ModelId, StructuredAnswer } from '../types'

export function promptForAction(action: string): string {
  const map: Record<string, string> = {
    depreciation:
      'Depreciate a $50,000 5-year computer placed in service March 15, 2025 for tax year 2025. Give book straight-line (5-year life, no salvage, half-year convention) and US federal MACRS GDS 5-year half-year. Jurisdiction US-federal. No §179 or bonus. Also draft the book journal entry.',
    journal_entries:
      'Draft the year-end book journal entry to record depreciation of $5,000 on computers (Dr Depreciation Expense / Cr Accumulated Depreciation — Computers), dated 2025-12-31. Validate that debits equal credits.',
    book_vs_tax:
      'Compare book vs tax depreciation for a $50,000 5-year asset placed in service 2025-03-15 for 2025: book SL 5 years half-year no salvage vs MACRS 5-year half-year. Reconcile the temporary difference and draft the book depreciation journal entry.',
    authority:
      'What does IRS Publication 946 say about the half-year convention and 5-year MACRS property? Cite only curated authorities.',
  }
  return map[action] ?? ''
}

export interface AgentResult {
  content: string
  structured: StructuredAnswer
}

/** Talks to our middleman server — the OpenAI key never enters the browser. */
export async function requestChat(
  history: Message[],
  model: ModelId,
  signal?: AbortSignal,
): Promise<AgentResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      history: history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    }),
    signal,
  })

  const data = (await res.json().catch(() => ({}))) as AgentResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Chat request failed (${res.status})`)
  }
  return {
    content: data.content,
    structured: data.structured ?? {},
  }
}

export async function* streamAssistantReply(
  _prompt: string,
  model: ModelId,
  history: Message[],
  signal?: AbortSignal,
  onTrace?: (line: string) => void,
): AsyncGenerator<{ type: 'text' | 'done'; value?: string; structured?: StructuredAnswer }> {
  onTrace?.('Talking to Chai server…')
  const result = await requestChat(history, model, signal)
  onTrace?.('Writing answer…')

  const text = result.content
  const chunks = text.match(/\S+\s*/g) ?? [text]
  for (const chunk of chunks) {
    if (signal?.aborted) return
    await new Promise((r) => setTimeout(r, 8 + Math.random() * 12))
    yield { type: 'text', value: chunk }
  }
  yield { type: 'done', structured: result.structured }
}
