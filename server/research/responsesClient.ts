import OpenAI from 'openai'
import { RESEARCH_SYSTEM_PROMPT } from '../../src/research/productionSchemas.ts'

export function resolveResearchModel(preferred?: string): string {
  const fromEnv = process.env.OPENAI_RESEARCH_MODEL?.trim()
  if (fromEnv) return fromEnv
  if (preferred === 'chai-deep') return 'gpt-4o'
  if (preferred === 'chai-fast') return 'gpt-4o-mini'
  return 'gpt-4o-mini'
}

export function mapModelId(model: string): string {
  return resolveResearchModel(model)
}

/** Thin Responses API wrapper — server-side only, store:false by default. */
export async function createStructuredResponse<T>(input: {
  model: string
  instructions: string
  userInput: string
  schemaName: string
  schema: Record<string, unknown>
  signal?: AbortSignal
}): Promise<{ data: T; usedResponsesApi: true; rawText: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing')
  }
  const client = new OpenAI({ apiKey })
  const response = await client.responses.create(
    {
      model: resolveResearchModel(input.model),
      store: false,
      instructions: `${RESEARCH_SYSTEM_PROMPT}\n\n${input.instructions}`,
      input: input.userInput,
      text: {
        format: {
          type: 'json_schema',
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    },
    { signal: input.signal },
  )

  const rawText =
    (response as { output_text?: string }).output_text ??
    extractOutputText(response) ??
    '{}'
  return {
    data: JSON.parse(rawText) as T,
    usedResponsesApi: true,
    rawText,
  }
}

function extractOutputText(response: unknown): string | null {
  const r = response as {
    output?: { type?: string; content?: { type?: string; text?: string }[] }[]
  }
  if (!Array.isArray(r.output)) return null
  for (const item of r.output) {
    if (!item.content) continue
    for (const c of item.content) {
      if (c.type === 'output_text' && c.text) return c.text
      if (c.text) return c.text
    }
  }
  return null
}
