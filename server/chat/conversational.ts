import OpenAI from 'openai'
import type { Message, ModelId, StructuredAnswer } from '../src/types.ts'
import type { ResponseMode, StudyPreference } from '../src/study/schemas.ts'
import { snapshotScoreMeta } from '../../src/study/index.ts'

function mapModel(model: ModelId): string {
  if (model === 'chai-deep') return 'gpt-4o'
  return 'gpt-4o-mini'
}

/** Normal conversational reply — no research pipeline. */
export async function createConversationalReply(input: {
  history: Message[]
  model: ModelId
  mode: ResponseMode
  studyPreference?: StudyPreference
  signal?: AbortSignal
}): Promise<{ content: string; structured: StructuredAnswer }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. Add it to your .env to use Chai.')
  }

  const client = new OpenAI({ apiKey })
  const studyNote =
    input.mode === 'cpa_exam_study'
      ? ' The user has CPA Exam Study mode on — if they ask a casual question, answer casually; if they pivot to accounting, be ready to teach in depth.'
      : ''

  const response = await client.chat.completions.create(
    {
      model: mapModel(input.model),
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'You are Chai, a friendly accounting AI assistant. Answer naturally and briefly like a helpful human. ' +
            'Do not invent tax/audit conclusions or run fake research. ' +
            'If they ask whether you work or say hi, just reply normally. ' +
            'If they ask an accounting question, say you can research it using their authoritative corpus.' +
            studyNote,
        },
        ...input.history.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ],
    },
    { signal: input.signal },
  )

  const content =
    response.choices[0]?.message?.content?.trim() ||
    'Hey — I’m here. Ask an accounting, tax, or audit question whenever you’re ready.'

  const structured = snapshotScoreMeta({
    responseMode: input.mode,
    studyPreference: input.studyPreference,
    assumptions: [],
    missingFacts: [],
    toolTrace: ['conversational_chat'],
  })

  return { content, structured }
}
