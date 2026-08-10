import type { Express, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { KnowledgeUploadMetaSchema } from '../src/knowledge/schemas.ts'
import {
  createSourceFromUpload,
  deleteSource,
  getVersionHistory,
  previewSource,
  retryIndexing,
  reviewSource,
  setSourceStatus,
  submitForReview,
  supersedeSource,
  updateSourceMetadata,
} from '../src/knowledge/service.ts'
import {
  appendAudit,
  getAllowlist,
  listAudit,
  listExternalCandidates,
  listSources,
  saveAllowlist,
  saveExternalCandidates,
} from '../src/knowledge/store/jsonStore.ts'
import { runControlledResearch } from '../src/knowledge/researchPipeline.ts'
import { MockLocalKnowledgeRetriever } from '../src/knowledge/retrieval/retriever.ts'
import { seedDemoKnowledgeIfEmpty } from '../src/knowledge/mock/seed.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const upload = multer({
  dest: path.resolve(__dirname, '../data/tmp'),
  limits: { fileSize: 12 * 1024 * 1024 },
})

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.CHAI_ADMIN_TOKEN?.trim()
  if (!expected) {
    res.status(503).json({
      error: 'CHAI_ADMIN_TOKEN is not configured on the server. Add it to .env for Knowledge Governance.',
    })
    return
  }
  const got = String(req.header('X-Chai-Admin-Token') || '')
  if (got !== expected) {
    void appendAudit({
      actor: 'anonymous',
      action: 'admin_denied',
      target: req.path,
      result: 'denied',
    })
    res.status(403).json({ error: 'Admin authorization required' })
    return
  }
  ;(req as Request & { adminActor?: string }).adminActor = 'admin'
  next()
}

function actor(req: Request): string {
  return (req as Request & { adminActor?: string }).adminActor || 'admin'
}

export function registerKnowledgeGovernanceRoutes(app: Express): void {
  fs.mkdirSync(path.resolve(__dirname, '../data/tmp'), { recursive: true })

  app.get('/api/knowledge/health', async (_req, res) => {
    await seedDemoKnowledgeIfEmpty().catch(() => undefined)
    const sources = await listSources()
    res.json({
      ok: true,
      adminConfigured: Boolean(process.env.CHAI_ADMIN_TOKEN?.trim()),
      sourceCount: sources.length,
      retrievalProvider: 'mock_local',
      officialResearchProvider: process.env.OFFICIAL_RESEARCH_PROVIDER || 'mock',
    })
  })

  app.get('/api/knowledge/sources', async (req, res) => {
    try {
      await seedDemoKnowledgeIfEmpty()
      let sources = await listSources()
      const q = String(req.query.q || '').toLowerCase()
      const status = req.query.status ? String(req.query.status) : ''
      if (status) sources = sources.filter((s) => s.status === status)
      if (q) {
        sources = sources.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.publisher.toLowerCase().includes(q) ||
            (s.topic || '').toLowerCase().includes(q),
        )
      }
      res.json({ sources, mockRetrieval: true })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
    }
  })

  app.post('/api/knowledge/sources/upload', adminAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }
    try {
      const metaRaw = req.body?.meta ? JSON.parse(String(req.body.meta)) : req.body
      const meta = KnowledgeUploadMetaSchema.parse(metaRaw)
      const source = await createSourceFromUpload({
        tempPath: req.file.path,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        meta,
        actor: actor(req),
      })
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      fs.unlink(req.file.path, () => undefined)
    }
  })

  app.patch('/api/knowledge/sources/:id', adminAuth, async (req, res) => {
    try {
      const source = await updateSourceMetadata(req.params.id, req.body ?? {}, actor(req))
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/submit', adminAuth, async (req, res) => {
    try {
      const source = await submitForReview(req.params.id, actor(req))
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Submit failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/review', adminAuth, async (req, res) => {
    try {
      const source = await reviewSource({
        id: req.params.id,
        actor: String(req.body?.actor || actor(req)),
        decision: req.body?.decision,
        reason: String(req.body?.reason || ''),
      })
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Review failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/disable', adminAuth, async (req, res) => {
    try {
      const source = await setSourceStatus(req.params.id, 'disabled', actor(req), req.body?.reason)
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Disable failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/restore', adminAuth, async (req, res) => {
    try {
      const source = await setSourceStatus(req.params.id, 'draft', actor(req), req.body?.reason)
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Restore failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/supersede', adminAuth, async (req, res) => {
    try {
      const source = await supersedeSource({
        oldId: req.params.id,
        newId: String(req.body?.newId || ''),
        actor: actor(req),
        reason: String(req.body?.reason || ''),
      })
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Supersede failed' })
    }
  })

  app.post('/api/knowledge/sources/:id/reindex', adminAuth, async (req, res) => {
    try {
      const source = await retryIndexing(req.params.id, actor(req))
      res.json({ source })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Reindex failed' })
    }
  })

  app.delete('/api/knowledge/sources/:id', adminAuth, async (req, res) => {
    try {
      await deleteSource(req.params.id, actor(req))
      res.json({ ok: true })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed' })
    }
  })

  app.get('/api/knowledge/sources/:id/preview', adminAuth, async (req, res) => {
    try {
      const preview = await previewSource(req.params.id)
      res.json(preview)
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })

  app.get('/api/knowledge/sources/:id/versions', adminAuth, async (req, res) => {
    try {
      const versions = await getVersionHistory(req.params.id)
      res.json({ versions })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Versions failed' })
    }
  })

  app.post('/api/knowledge/test-retrieval', adminAuth, async (req, res) => {
    try {
      const retriever = new MockLocalKnowledgeRetriever()
      const hits = await retriever.search({
        searchTerms: String(req.body?.query || ''),
        taxYear: req.body?.taxYear ? Number(req.body.taxYear) : undefined,
        jurisdiction: req.body?.jurisdiction,
        includeExcludedStatuses: Boolean(req.body?.includeExcludedStatuses),
        allowHistoricalSuperseded: Boolean(req.body?.allowHistoricalSuperseded),
        organizationId: req.body?.organizationId,
      })
      await appendAudit({
        actor: actor(req),
        action: 'test_retrieval',
        target: 'knowledge',
        afterSummary: `${hits.length} hits`,
        result: 'success',
      })
      res.json({ hits, mockRetrieval: true })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Retrieval test failed' })
    }
  })

  app.post('/api/knowledge/research', async (req, res) => {
    try {
      const result = await runControlledResearch({
        question: String(req.body?.question || ''),
        organizationId: req.body?.organizationId,
        actor: 'user',
      })
      res.json({ research: result })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Research failed' })
    }
  })

  app.get('/api/knowledge/allowlist', adminAuth, async (_req, res) => {
    res.json({ allowlist: await getAllowlist() })
  })

  app.put('/api/knowledge/allowlist', adminAuth, async (req, res) => {
    try {
      const entries = Array.isArray(req.body?.allowlist) ? req.body.allowlist : []
      await saveAllowlist(entries)
      await appendAudit({
        actor: actor(req),
        action: 'allowlist_update',
        target: 'allowlist',
        result: 'success',
      })
      res.json({ allowlist: await getAllowlist() })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Allowlist update failed' })
    }
  })

  app.get('/api/knowledge/external-candidates', adminAuth, async (_req, res) => {
    res.json({ candidates: await listExternalCandidates() })
  })

  app.post('/api/knowledge/external-candidates/:id/promote', adminAuth, async (req, res) => {
    try {
      const all = await listExternalCandidates()
      const idx = all.findIndex((c) => c.id === req.params.id)
      if (idx < 0) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      all[idx].status = 'promoted'
      await saveExternalCandidates(all)
      await appendAudit({
        actor: actor(req),
        action: 'external_promote',
        target: req.params.id,
        result: 'success',
        reason: String(req.body?.reason || 'Promoted into review queue for KB intake'),
      })
      res.json({ candidate: all[idx] })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Promote failed' })
    }
  })

  app.get('/api/knowledge/audit', adminAuth, async (_req, res) => {
    res.json({ records: await listAudit(300) })
  })
}
