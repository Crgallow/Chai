import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { KnowledgeSource } from '../src/knowledge/schemas.ts'
import {
  LocalDocumentProcessor,
  checksumFile,
  safeFileName,
  validateUpload,
} from '../src/knowledge/processor/localProcessor.ts'
import {
  KG_FILES,
  appendAudit,
  listSources,
  replaceChunksForSource,
  upsertSource,
} from '../src/knowledge/store/jsonStore.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const AUTHORITATIVE_ROOT = path.resolve(__dirname, '../authoritative-sources')
export const AUTHORITATIVE_MANIFEST = path.join(AUTHORITATIVE_ROOT, 'manifest.json')

const ManifestEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  publisher: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceType: z.enum([
    'authoritative',
    'regulatory',
    'secondary',
    'educational',
    'organization_policy',
  ]),
  category: z.enum([
    'tax',
    'audit',
    'financial_accounting',
    'managerial_accounting',
    'regulatory',
    'company_policy',
  ]),
  authorityLevel: z.enum([
    'primary_authority',
    'official_guidance',
    'professional_standard',
    'secondary_analysis',
    'internal_policy',
  ]),
  licensingStatus: z.enum([
    'public',
    'licensed',
    'restricted',
    'permission_required',
    'unknown',
  ]),
  jurisdiction: z.string().optional(),
  taxYear: z.number().int().optional(),
  accountingFramework: z.enum(['US_GAAP', 'IFRS', 'TAX', 'OTHER']).optional(),
  auditFramework: z.enum(['AICPA', 'PCAOB', 'GAGAS', 'OTHER']).optional(),
  topic: z.string().optional(),
  subtopic: z.string().optional(),
  effectiveDate: z.string().optional(),
  sourceUrl: z.string().optional(),
  entityTypes: z.array(z.string()).optional(),
  publicPrivateApplicability: z.enum(['public', 'private', 'both', 'not_applicable']).optional(),
})

const ManifestSchema = z.object({
  version: z.number().int().default(1),
  description: z.string().optional(),
  sources: z.array(ManifestEntrySchema).default([]),
})

const processor = new LocalDocumentProcessor()
/** Large USC PDFs can hang pdf-parse; fail the file and continue the corpus. */
const EXTRACT_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${Math.round(ms / 1000)}s: ${label}`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function mimeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (ext === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (ext === '.csv') return 'text/csv'
  if (ext === '.md') return 'text/markdown'
  return 'text/plain'
}

/**
 * Sync git-tracked authoritative-sources/ into Knowledge Governance runtime store.
 * Stable ids come from manifest.json so restarts update in place instead of duplicating.
 */
export async function syncAuthoritativeSourcesFromRepo(): Promise<{
  synced: number
  skipped: number
  errors: string[]
}> {
  const errors: string[] = []
  let synced = 0
  let skipped = 0

  let raw: string
  try {
    raw = await fs.readFile(AUTHORITATIVE_MANIFEST, 'utf8')
  } catch {
    return { synced: 0, skipped: 0, errors: ['authoritative-sources/manifest.json not found'] }
  }

  let manifest: z.infer<typeof ManifestSchema>
  try {
    manifest = ManifestSchema.parse(JSON.parse(raw))
  } catch (err) {
    return {
      synced: 0,
      skipped: 0,
      errors: [`Invalid manifest.json: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  await fs.mkdir(KG_FILES, { recursive: true })
  const existing = await listSources()
  const byId = new Map(existing.map((s) => [s.id, s]))

  for (const entry of manifest.sources) {
    try {
      const abs = path.resolve(AUTHORITATIVE_ROOT, entry.file)
      if (!abs.startsWith(AUTHORITATIVE_ROOT)) {
        throw new Error(`Path escapes authoritative-sources/: ${entry.file}`)
      }
      const stat = await fs.stat(abs)
      validateUpload(entry.file, mimeFor(entry.file), stat.size)
      const checksum = await checksumFile(abs)
      const prev = byId.get(`ks_repo_${entry.id}`)
      if (prev?.checksum === checksum && prev.status === 'approved') {
        if (prev.indexingStatus === 'indexed') {
          skipped += 1
          continue
        }
        // Don't retry the same bytes that already timed out / failed extraction.
        if (
          prev.indexingStatus === 'failed' &&
          (prev.indexingError?.includes('Timed out') ||
            prev.indexingError?.includes('No extractable text'))
        ) {
          skipped += 1
          continue
        }
      }

      const id = `ks_repo_${entry.id}`
      const stored = `${id}__${safeFileName(path.basename(entry.file))}`
      const dest = path.join(KG_FILES, stored)
      await fs.copyFile(abs, dest)

      const now = new Date().toISOString()
      let source: KnowledgeSource = {
        id,
        organizationId: 'platform',
        publisher: entry.publisher,
        title: entry.title,
        description: entry.description,
        sourceType: entry.sourceType,
        category: entry.category,
        topic: entry.topic,
        subtopic: entry.subtopic,
        accountingFramework: entry.accountingFramework,
        auditFramework: entry.auditFramework,
        jurisdiction: entry.jurisdiction,
        taxYear: entry.taxYear,
        entityTypes: entry.entityTypes,
        publicPrivateApplicability: entry.publicPrivateApplicability,
        effectiveDate: entry.effectiveDate,
        authorityLevel: entry.authorityLevel,
        licensingStatus: entry.licensingStatus,
        sourceUrl: entry.sourceUrl,
        storagePath: stored,
        originalFileName: path.basename(entry.file),
        mimeType: mimeFor(entry.file),
        fileSize: stat.size,
        checksum,
        status: 'approved',
        indexingStatus: 'processing',
        verificationStatus: entry.licensingStatus === 'public' ? 'verified' : 'unverified',
        version: (prev?.version ?? 0) + 1,
        previousVersionId: prev?.id,
        createdAt: prev?.createdAt ?? now,
        createdBy: prev?.createdBy ?? 'repo-sync',
        updatedAt: now,
        updatedBy: 'repo-sync',
        lastVerifiedAt: now,
        lastVerifiedBy: 'repo-sync',
      }

      try {
        const extracted = await withTimeout(
          processor.extract({
            absolutePath: dest,
            originalFileName: path.basename(entry.file),
            mimeType: mimeFor(entry.file),
          }),
          EXTRACT_TIMEOUT_MS,
          entry.file,
        )
        source.extractedTextPreview = extracted.text.slice(0, 2000)
        const chunks = await processor.chunk(extracted, source)
        const indexed = await processor.index(chunks)
        await replaceChunksForSource(source.id, chunks)
        source.indexingStatus = indexed.status === 'indexed' ? 'indexed' : 'failed'
        source.indexingError = indexed.error
        if (source.indexingStatus === 'indexed') {
          source.status = 'approved'
        }
      } catch (extractErr) {
        source.indexingStatus = 'failed'
        source.indexingError =
          extractErr instanceof Error ? extractErr.message : String(extractErr)
        source.status = 'approved'
        await replaceChunksForSource(source.id, [])
      }
      await upsertSource(source)
      await appendAudit({
        actor: 'repo-sync',
        organizationId: 'platform',
        action: 'repo_authoritative_sync',
        target: source.id,
        afterSummary: `${entry.file} → ${source.indexingStatus}`,
        result: source.indexingStatus === 'indexed' ? 'success' : 'failure',
      })
      synced += 1
    } catch (err) {
      errors.push(`${entry.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { synced, skipped, errors }
}
