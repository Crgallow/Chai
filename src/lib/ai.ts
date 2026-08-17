import type { Message, ModelId, ResponseMode, StructuredAnswer, StudyPreference } from '../types'
import type { ResearchProgressEvent, ResearchRun } from '../research/schemas'

export function promptForAction(action: string): string {
  const map: Record<string, string> = {
    depreciation:
      'Depreciate a $50,000 5-year computer placed in service 2025-03-15 for tax year 2025. Give book straight-line (5-year life, no salvage, half-year convention) and US federal MACRS GDS 5-year half-year. Jurisdiction US-federal. Country United States. No §179 or bonus. Also draft the book journal entry.',
    journal_entries:
      'Draft the year-end book journal entry to record depreciation of $5,000 on computers (Dr Depreciation Expense / Cr Accumulated Depreciation — Computers), dated 2025-12-31. US GAAP. Country United States. Validate that debits equal credits.',
    book_vs_tax:
      'Compare book vs tax depreciation for a $50,000 5-year asset placed in service 2025-03-15 for 2025: book SL 5 years half-year no salvage vs MACRS 5-year half-year. Jurisdiction US-federal. Country United States. Reconcile the temporary difference and draft the book depreciation journal entry.',
    authority:
      'What does IRS Publication 946 say about the half-year convention and 5-year MACRS property for tax year 2025? Jurisdiction US-federal. Country United States. Cite only curated authorities.',
  }
  return map[action] ?? ''
}

export interface AgentResult {
  content: string
  structured: StructuredAnswer
}

export async function requestChat(
  history: Message[],
  model: ModelId,
  signal?: AbortSignal,
  options?: {
    mode?: ResponseMode
    studyPreference?: StudyPreference
    onResearchProgress?: (event: ResearchProgressEvent) => void
  },
): Promise<AgentResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      mode: options?.mode ?? 'professional',
      studyPreference: options?.studyPreference,
      stream: true,
      history: history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        responseMode: m.responseMode,
        studyPreference: m.studyPreference,
      })),
    }),
    signal,
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Chat request failed (${res.status})`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream') || !res.body) {
    const data = (await res.json()) as AgentResult
    return { content: data.content, structured: data.structured ?? {} }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: AgentResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const chunk of parts) {
      const lines = chunk.split('\n')
      let event = 'message'
      let dataLine = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) dataLine += line.slice(5).trim()
      }
      if (!dataLine) continue
      const data = JSON.parse(dataLine) as unknown
      if (event === 'research') {
        options?.onResearchProgress?.(data as ResearchProgressEvent)
      } else if (event === 'result') {
        result = data as AgentResult
      } else if (event === 'error') {
        throw new Error((data as { error?: string }).error || 'Chat stream error')
      }
    }
  }

  if (!result) throw new Error('Chat stream ended without a result')
  return {
    content: result.content,
    structured: result.structured ?? {},
  }
}

export async function* streamAssistantReply(
  _prompt: string,
  model: ModelId,
  history: Message[],
  signal?: AbortSignal,
  onTrace?: (line: string) => void,
  options?: {
    mode?: ResponseMode
    studyPreference?: StudyPreference
    onResearchRun?: (run: ResearchRun) => void
  },
): AsyncGenerator<{ type: 'text' | 'done'; value?: string; structured?: StructuredAnswer }> {
  onTrace?.('Starting accounting research workflow…')
  let latestRun: ResearchRun | undefined

  const result = await requestChat(history, model, signal, {
    mode: options?.mode,
    studyPreference: options?.studyPreference,
    onResearchProgress: (ev) => {
      if (ev.type === 'stage_started') {
        onTrace?.(`${ev.label}…`)
      } else if (ev.type === 'stage_updated') {
        latestRun = ev.run
        options?.onResearchRun?.(ev.run)
        onTrace?.(ev.stage.summary || ev.stage.displayLabel)
      } else if (ev.type === 'run_blocked') {
        latestRun = ev.run
        options?.onResearchRun?.(ev.run)
        onTrace?.('Research blocked — need more information')
      } else if (ev.type === 'run_completed') {
        latestRun = ev.run
        options?.onResearchRun?.(ev.run)
      }
    },
  })

  onTrace?.('Writing answer…')
  const text = result.content
  const chunks = text.match(/\S+\s*/g) ?? [text]
  for (const chunk of chunks) {
    if (signal?.aborted) return
    await new Promise((r) => setTimeout(r, 6 + Math.random() * 10))
    yield { type: 'text', value: chunk }
  }

  const structured = {
    ...result.structured,
    researchProcess: result.structured.researchProcess ?? latestRun,
  }
  yield { type: 'done', structured }
}
