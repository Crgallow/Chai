import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AuditRecordSchema,
  DomainAllowlistEntrySchema,
  DocumentChunkSchema,
  ExternalCandidateSchema,
  KnowledgeSourceSchema,
  type AuditRecord,
  type DomainAllowlistEntry,
  type DocumentChunk,
  type ExternalCandidate,
  type KnowledgeSource,
} from '../schemas.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const KG_ROOT = path.resolve(__dirname, '../../../data/knowledge-governance')
export const KG_FILES = path.join(KG_ROOT, 'files')
export const KG_SOURCES = path.join(KG_ROOT, 'sources.json')
export const KG_CHUNKS = path.join(KG_ROOT, 'chunks.json')
export const KG_AUDIT = path.join(KG_ROOT, 'audit.json')
export const KG_ALLOWLIST = path.join(KG_ROOT, 'allowlist.json')
export const KG_EXTERNAL = path.join(KG_ROOT, 'external-candidates.json')

const DEFAULT_ALLOWLIST: DomainAllowlistEntry[] = [
  { domain: 'irs.gov', publisher: 'IRS', addedAt: new Date(0).toISOString(), addedBy: 'system', enabled: true },
  { domain: 'fasb.org', publisher: 'FASB', addedAt: new Date(0).toISOString(), addedBy: 'system', enabled: true },
  { domain: 'pcaobus.org', publisher: 'PCAOB', addedAt: new Date(0).toISOString(), addedBy: 'system', enabled: true },
  { domain: 'sec.gov', publisher: 'SEC', addedAt: new Date(0).toISOString(), addedBy: 'system', enabled: true },
  {
    domain: 'aicpa-cima.com',
    publisher: 'AICPA',
    addedAt: new Date(0).toISOString(),
    addedBy: 'system',
    enabled: true,
  },
]

async function ensure(): Promise<void> {
  await fs.mkdir(KG_FILES, { recursive: true })
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensure()
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensure()
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8')
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export async function listSources(): Promise<KnowledgeSource[]> {
  const raw = await readJson<unknown[]>(KG_SOURCES, [])
  return raw.map((r) => KnowledgeSourceSchema.parse(r))
}

export async function saveSources(sources: KnowledgeSource[]): Promise<void> {
  await writeJson(KG_SOURCES, sources)
}

export async function getSource(id: string): Promise<KnowledgeSource | null> {
  const sources = await listSources()
  return sources.find((s) => s.id === id) ?? null
}

export async function upsertSource(source: KnowledgeSource): Promise<KnowledgeSource> {
  const parsed = KnowledgeSourceSchema.parse(source)
  const sources = await listSources()
  const idx = sources.findIndex((s) => s.id === parsed.id)
  if (idx >= 0) sources[idx] = parsed
  else sources.push(parsed)
  await saveSources(sources)
  return parsed
}

export async function deleteSourceRecord(id: string): Promise<boolean> {
  const sources = await listSources()
  const next = sources.filter((s) => s.id !== id)
  if (next.length === sources.length) return false
  await saveSources(next)
  const chunks = await listChunks()
  await saveChunks(chunks.filter((c) => c.sourceId !== id))
  return true
}

export async function listChunks(): Promise<DocumentChunk[]> {
  const raw = await readJson<unknown[]>(KG_CHUNKS, [])
  return raw.map((r) => DocumentChunkSchema.parse(r))
}

export async function saveChunks(chunks: DocumentChunk[]): Promise<void> {
  await writeJson(KG_CHUNKS, chunks)
}

export async function replaceChunksForSource(sourceId: string, chunks: DocumentChunk[]): Promise<void> {
  const all = await listChunks()
  await saveChunks([...all.filter((c) => c.sourceId !== sourceId), ...chunks])
}

export async function appendAudit(partial: Omit<AuditRecord, 'id' | 'timestamp'> & { timestamp?: string }): Promise<AuditRecord> {
  const record = AuditRecordSchema.parse({
    id: uid('audit'),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  })
  const all = await readJson<unknown[]>(KG_AUDIT, [])
  all.push(record)
  await writeJson(KG_AUDIT, all)
  return record
}

export async function listAudit(limit = 200): Promise<AuditRecord[]> {
  const raw = await readJson<unknown[]>(KG_AUDIT, [])
  return raw
    .map((r) => AuditRecordSchema.parse(r))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
}

export async function getAllowlist(): Promise<DomainAllowlistEntry[]> {
  const raw = await readJson<unknown[] | null>(KG_ALLOWLIST, null)
  if (!raw || raw.length === 0) {
    await writeJson(KG_ALLOWLIST, DEFAULT_ALLOWLIST)
    return DEFAULT_ALLOWLIST
  }
  return raw.map((r) => DomainAllowlistEntrySchema.parse(r))
}

export async function saveAllowlist(entries: DomainAllowlistEntry[]): Promise<void> {
  await writeJson(
    KG_ALLOWLIST,
    entries.map((e) => DomainAllowlistEntrySchema.parse(e)),
  )
}

export async function listExternalCandidates(): Promise<ExternalCandidate[]> {
  const raw = await readJson<unknown[]>(KG_EXTERNAL, [])
  return raw.map((r) => ExternalCandidateSchema.parse(r))
}

export async function saveExternalCandidates(items: ExternalCandidate[]): Promise<void> {
  await writeJson(KG_EXTERNAL, items)
}
