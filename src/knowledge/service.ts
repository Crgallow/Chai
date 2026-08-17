import fs from 'node:fs/promises'
import path from 'node:path'
import type { KnowledgeSource, KnowledgeUploadMeta } from './schemas.ts'
import {
  LocalDocumentProcessor,
  checksumFile,
  safeFileName,
  validateUpload,
} from './processor/localProcessor.ts'
import {
  KG_FILES,
  appendAudit,
  deleteSourceRecord,
  getSource,
  listChunks,
  listChunksForSource,
  listSources,
  replaceChunksForSource,
  uid,
  upsertSource,
} from './store/jsonStore.ts'

const processor = new LocalDocumentProcessor()

export async function createSourceFromUpload(input: {
  tempPath: string
  originalName: string
  mimeType: string
  size: number
  meta: KnowledgeUploadMeta
  actor: string
}): Promise<KnowledgeSource> {
  validateUpload(input.originalName, input.mimeType, input.size)
  const checksum = await checksumFile(input.tempPath)
  const existing = (await listSources()).find((s) => s.checksum === checksum)
  if (existing) {
    throw new Error(`Duplicate document detected (checksum match): ${existing.title} (${existing.id})`)
  }

  const id = uid('ks')
  const stored = `${id}__${safeFileName(input.originalName)}`
  const dest = path.join(KG_FILES, stored)
  await fs.mkdir(KG_FILES, { recursive: true })
  await fs.copyFile(input.tempPath, dest)

  const now = new Date().toISOString()
  let source: KnowledgeSource = {
    id,
    organizationId: input.meta.organizationId ?? 'platform',
    publisher: input.meta.publisher,
    title: input.meta.title,
    description: input.meta.description,
    sourceType: input.meta.sourceType,
    category: input.meta.category,
    topic: input.meta.topic,
    subtopic: input.meta.subtopic,
    accountingFramework: input.meta.accountingFramework,
    auditFramework: input.meta.auditFramework,
    jurisdiction: input.meta.jurisdiction,
    taxYear: input.meta.taxYear,
    entityTypes: input.meta.entityTypes,
    publicPrivateApplicability: input.meta.publicPrivateApplicability,
    effectiveDate: input.meta.effectiveDate,
    authorityLevel: input.meta.authorityLevel,
    licensingStatus: input.meta.licensingStatus,
    sourceUrl: input.meta.sourceUrl || undefined,
    storagePath: stored,
    originalFileName: input.originalName,
    mimeType: input.mimeType,
    fileSize: input.size,
    checksum,
    status: 'draft',
    indexingStatus: 'processing',
    verificationStatus: 'unverified',
    version: 1,
    createdAt: now,
    createdBy: input.actor,
    updatedAt: now,
    updatedBy: input.actor,
  }

  source = await upsertSource(source)

  try {
    const extracted = await processor.extract({
      absolutePath: dest,
      originalFileName: input.originalName,
      mimeType: input.mimeType,
    })
    source.extractedTextPreview = extracted.text.slice(0, 2000)
    const chunks = await processor.chunk(extracted, source)
    const indexed = await processor.index(chunks)
    await replaceChunksForSource(source.id, chunks)
    source.indexingStatus = indexed.status === 'indexed' ? 'indexed' : 'failed'
    source.indexingError = indexed.error
  } catch (err) {
    source.indexingStatus = 'failed'
    source.indexingError = err instanceof Error ? err.message : String(err)
  }

  source.updatedAt = new Date().toISOString()
  source = await upsertSource(source)

  await appendAudit({
    actor: input.actor,
    organizationId: source.organizationId,
    action: 'upload',
    target: source.id,
    afterSummary: `${source.title} (${source.indexingStatus})`,
    result: source.indexingStatus === 'indexed' ? 'success' : 'failure',
  })

  return source
}

export async function submitForReview(id: string, actor: string): Promise<KnowledgeSource> {
  const source = await getSource(id)
  if (!source) throw new Error('Source not found')
  if (source.status !== 'draft' && source.status !== 'rejected') {
    throw new Error('Only draft/rejected sources can be submitted for review')
  }
  source.status = 'pending_review'
  source.updatedAt = new Date().toISOString()
  source.updatedBy = actor
  const saved = await upsertSource(source)
  await appendAudit({
    actor,
    organizationId: source.organizationId,
    action: 'submit_review',
    target: id,
    result: 'success',
  })
  return saved
}

export async function reviewSource(input: {
  id: string
  actor: string
  decision: 'approved' | 'rejected'
  reason: string
}): Promise<KnowledgeSource> {
  const source = await getSource(input.id)
  if (!source) throw new Error('Source not found')
  if (source.status !== 'pending_review') throw new Error('Source is not pending review')
  if (!input.reason.trim()) throw new Error('Approval/rejection requires a reason')
  if (input.actor === source.createdBy && input.decision === 'approved') {
    throw new Error('Uploader cannot approve their own document without a separate authorized role')
  }
  if (
    input.decision === 'approved' &&
    (source.licensingStatus === 'unknown' || source.licensingStatus === 'permission_required')
  ) {
    throw new Error(
      'Sources with licensingStatus unknown or permission_required cannot be approved for commercial use without licensing review',
    )
  }

  source.status = input.decision
  source.reviewReason = input.reason
  source.updatedAt = new Date().toISOString()
  source.updatedBy = input.actor
  if (input.decision === 'approved') {
    source.verificationStatus = 'verified'
    source.lastVerifiedAt = source.updatedAt
    source.lastVerifiedBy = input.actor
  }
  const saved = await upsertSource(source)
  await appendAudit({
    actor: input.actor,
    organizationId: source.organizationId,
    action: input.decision === 'approved' ? 'approve' : 'reject',
    target: input.id,
    reason: input.reason,
    result: 'success',
  })
  return saved
}

export async function setSourceStatus(
  id: string,
  status: 'disabled' | 'draft',
  actor: string,
  reason?: string,
): Promise<KnowledgeSource> {
  const source = await getSource(id)
  if (!source) throw new Error('Source not found')
  const before = source.status
  source.status = status
  source.updatedAt = new Date().toISOString()
  source.updatedBy = actor
  const saved = await upsertSource(source)
  await appendAudit({
    actor,
    organizationId: source.organizationId,
    action: status === 'disabled' ? 'disable' : 'restore',
    target: id,
    beforeSummary: before,
    afterSummary: status,
    reason,
    result: 'success',
  })
  return saved
}

export async function supersedeSource(input: {
  oldId: string
  newId: string
  actor: string
  reason: string
}): Promise<KnowledgeSource> {
  const oldS = await getSource(input.oldId)
  const newS = await getSource(input.newId)
  if (!oldS || !newS) throw new Error('Source not found')
  if (newS.status !== 'approved') throw new Error('Replacement source must be approved')
  oldS.status = 'superseded'
  oldS.supersededDate = new Date().toISOString().slice(0, 10)
  oldS.updatedAt = new Date().toISOString()
  oldS.updatedBy = input.actor
  newS.supersedesSourceId = oldS.id
  newS.updatedAt = oldS.updatedAt
  newS.updatedBy = input.actor
  await upsertSource(newS)
  const saved = await upsertSource(oldS)
  await appendAudit({
    actor: input.actor,
    organizationId: oldS.organizationId,
    action: 'supersede',
    target: oldS.id,
    afterSummary: `superseded by ${newS.id}`,
    reason: input.reason,
    result: 'success',
  })
  return saved
}

export async function retryIndexing(id: string, actor: string): Promise<KnowledgeSource> {
  const source = await getSource(id)
  if (!source?.storagePath) throw new Error('Source or file missing')
  const abs = path.join(KG_FILES, source.storagePath)
  source.indexingStatus = 'processing'
  source.indexingError = undefined
  await upsertSource(source)
  try {
    const extracted = await processor.extract({
      absolutePath: abs,
      originalFileName: source.originalFileName || source.storagePath,
      mimeType: source.mimeType || 'application/octet-stream',
    })
    source.extractedTextPreview = extracted.text.slice(0, 2000)
    const chunks = await processor.chunk(extracted, source)
    const indexed = await processor.index(chunks)
    await replaceChunksForSource(source.id, chunks)
    source.indexingStatus = indexed.status === 'indexed' ? 'indexed' : 'failed'
    source.indexingError = indexed.error
  } catch (err) {
    source.indexingStatus = 'failed'
    source.indexingError = err instanceof Error ? err.message : String(err)
  }
  source.updatedAt = new Date().toISOString()
  source.updatedBy = actor
  const saved = await upsertSource(source)
  await appendAudit({
    actor,
    organizationId: source.organizationId,
    action: 'retry_index',
    target: id,
    afterSummary: source.indexingStatus,
    result: source.indexingStatus === 'indexed' ? 'success' : 'failure',
  })
  return saved
}

export async function deleteSource(id: string, actor: string): Promise<void> {
  const source = await getSource(id)
  if (!source) throw new Error('Source not found')
  if (source.status === 'approved') {
    throw new Error('Disable or supersede approved sources before delete')
  }
  if (source.storagePath) {
    await fs.unlink(path.join(KG_FILES, source.storagePath)).catch(() => undefined)
  }
  await deleteSourceRecord(id)
  await appendAudit({
    actor,
    organizationId: source.organizationId,
    action: 'delete',
    target: id,
    beforeSummary: source.title,
    result: 'success',
  })
}

export async function updateSourceMetadata(
  id: string,
  patch: Partial<KnowledgeUploadMeta>,
  actor: string,
): Promise<KnowledgeSource> {
  const source = await getSource(id)
  if (!source) throw new Error('Source not found')
  // Approved edits create a new version record rather than silent rewrite of history
  if (source.status === 'approved') {
    const now = new Date().toISOString()
    const newId = uid('ks')
    const clone: KnowledgeSource = {
      ...source,
      ...patch,
      id: newId,
      status: 'draft',
      version: source.version + 1,
      previousVersionId: source.id,
      verificationStatus: 'requires_reverification',
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
      reviewReason: undefined,
    }
    const saved = await upsertSource(clone)
    await appendAudit({
      actor,
      organizationId: source.organizationId,
      action: 'version_edit',
      target: newId,
      beforeSummary: source.id,
      afterSummary: 'new draft version from approved source',
      result: 'success',
    })
    return saved
  }

  Object.assign(source, patch)
  source.updatedAt = new Date().toISOString()
  source.updatedBy = actor
  const saved = await upsertSource(source)
  await appendAudit({
    actor,
    organizationId: source.organizationId,
    action: 'metadata_update',
    target: id,
    result: 'success',
  })
  return saved
}

export async function getVersionHistory(id: string): Promise<KnowledgeSource[]> {
  const all = await listSources()
  const chain: KnowledgeSource[] = []
  let current = all.find((s) => s.id === id)
  while (current) {
    chain.push(current)
    current = current.previousVersionId
      ? all.find((s) => s.id === current!.previousVersionId)
      : undefined
  }
  // also include newer versions that point back
  const newer = all.filter((s) => s.previousVersionId === id || chain.some((c) => s.previousVersionId === c.id))
  return [...new Map([...chain, ...newer].map((s) => [s.id, s])).values()].sort(
    (a, b) => a.version - b.version,
  )
}

export async function previewSource(id: string): Promise<{ source: KnowledgeSource; chunkCount: number }> {
  const source = await getSource(id)
  if (!source) throw new Error('Source not found')
  const chunks = await listChunksForSource(id)
  return { source, chunkCount: chunks.length }
}
