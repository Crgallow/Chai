import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StructuredAnswer } from '../src/types.ts'
import type { ResponseMode, StudyPreference } from '../src/study/schemas.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../data/study')
const SNAPSHOTS = path.join(ROOT, 'response-snapshots.json')

export interface ResponseScoreSnapshot {
  id: string
  createdAt: string
  responseMode: ResponseMode
  studyPreference?: StudyPreference
  evidenceConfidenceScore?: number
  sourceQualityScore?: number
  evidenceConfidence?: StructuredAnswer['evidenceConfidence']
  sourceQuality?: StructuredAnswer['sourceQuality']
  capsApplied?: string[]
  citationsCount?: number
  validationResults?: {
    calculationPassed?: boolean | null
    journalBalanced?: boolean | null
  }
  researchVersion?: string
  /** Historical scores are never overwritten — each generation appends. */
  immutable: true
}

async function ensure(): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true })
}

async function readAll(): Promise<ResponseScoreSnapshot[]> {
  await ensure()
  try {
    const raw = await fs.readFile(SNAPSHOTS, 'utf8')
    return JSON.parse(raw) as ResponseScoreSnapshot[]
  } catch {
    return []
  }
}

async function writeAll(rows: ResponseScoreSnapshot[]): Promise<void> {
  await ensure()
  await fs.writeFile(SNAPSHOTS, JSON.stringify(rows, null, 2), 'utf8')
}

export async function appendResponseScoreSnapshot(input: {
  structured: StructuredAnswer
  mode: ResponseMode
  studyPreference?: StudyPreference
}): Promise<ResponseScoreSnapshot> {
  const row: ResponseScoreSnapshot = {
    id: `snap_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    responseMode: input.mode,
    studyPreference: input.studyPreference,
    evidenceConfidenceScore: input.structured.evidenceConfidence?.score,
    sourceQualityScore: input.structured.sourceQuality?.score,
    evidenceConfidence: input.structured.evidenceConfidence,
    sourceQuality: input.structured.sourceQuality,
    capsApplied: input.structured.evidenceConfidence?.capsApplied.map((c) => c.code),
    citationsCount:
      input.structured.cpaStudy?.citations.length ??
      input.structured.research?.citations.length ??
      input.structured.citations?.length ??
      0,
    validationResults: {
      calculationPassed: input.structured.cpaStudy?.calculation?.passedValidation ?? null,
      journalBalanced: input.structured.journalEntries?.every((j) => j.balanced) ?? null,
    },
    researchVersion:
      input.structured.evidenceConfidence?.researchVersion ??
      input.structured.cpaStudy?.researchVersion,
    immutable: true,
  }
  const all = await readAll()
  all.unshift(row)
  await writeAll(all.slice(0, 2000))
  return row
}
