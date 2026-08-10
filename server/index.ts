import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import type { Message, ModelId } from '../src/types.ts'
import { runAccountingAgent } from './agent.ts'
import {
  deleteDocument,
  ingestUploadedFile,
  listDocuments,
  searchDocuments,
} from './documents.ts'
import { registerKnowledgeGovernanceRoutes } from './knowledgeGovernance.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 3001)

const upload = multer({
  dest: path.resolve(__dirname, '../data/tmp'),
  limits: { fileSize: 12 * 1024 * 1024 },
})

fs.mkdirSync(path.resolve(__dirname, '../data/tmp'), { recursive: true })

/** Simple per-IP rate limit to limit quota burn through the public site. */
const hits = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const row = hits.get(ip)
  if (!row || now > row.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (row.count >= MAX_PER_WINDOW) return false
  row.count += 1
  return true
}

app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

registerKnowledgeGovernanceRoutes(app)

app.get('/api/health', async (_req, res) => {
  const docs = await listDocuments().catch(() => [])
  res.json({
    ok: true,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    documentCount: docs.length,
  })
})

app.get('/api/documents', async (_req, res) => {
  try {
    const documents = await listDocuments()
    res.json({ documents })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
  }
})

app.post('/api/documents', upload.single('file'), async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  if (!rateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }
  try {
    const meta = await ingestUploadedFile({
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    })
    res.json({ document: meta })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
  } finally {
    fs.unlink(req.file.path, () => undefined)
  }
})

app.delete('/api/documents/:id', async (req, res) => {
  try {
    const ok = await deleteDocument(req.params.id)
    if (!ok) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' })
  }
})

app.post('/api/documents/search', async (req, res) => {
  try {
    const query = String(req.body?.query ?? '')
    const limit = Number(req.body?.limit ?? 5)
    const hits = await searchDocuments(query, limit)
    res.json({ hits })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Search failed' })
  }
})

app.post('/api/chat', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  if (!rateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' })
    return
  }

  const model = (req.body?.model as ModelId) || 'chai-1.0'
  const history = req.body?.history as Message[] | undefined

  if (!Array.isArray(history) || history.length === 0) {
    res.status(400).json({ error: 'history must be a non-empty array of messages' })
    return
  }

  const safeHistory = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({
      id: String(m.id ?? ''),
      role: m.role,
      content: String(m.content).slice(0, 20_000),
      createdAt: Number(m.createdAt) || Date.now(),
    }))
    .slice(-30)

  if (safeHistory.length === 0) {
    res.status(400).json({ error: 'No valid messages in history' })
    return
  }

  try {
    const result = await runAccountingAgent(safeHistory, model)
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chat failed'
    console.error('[api/chat]', message)
    res.status(500).json({ error: message })
  }
})

const distPath = path.resolve(__dirname, '../dist')
app.use(express.static(distPath))
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.method !== 'GET') return next()
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next()
  })
})

app.listen(PORT, () => {
  console.log(`Chai middleman listening on http://localhost:${PORT}`)
  console.log(
    process.env.OPENAI_API_KEY?.trim()
      ? 'OPENAI_API_KEY is set (kept on the server only).'
      : 'WARNING: OPENAI_API_KEY is missing. Add it to .env',
  )
})
