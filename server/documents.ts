import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(__dirname, '../../data/documents')
export const FILES_DIR = path.join(DATA_DIR, 'files')
export const INDEX_PATH = path.join(DATA_DIR, 'index.json')

export interface DocChunk {
  id: string
  documentId: string
  filename: string
  chunkIndex: number
  text: string
  embedding: number[]
}

export interface DocumentMeta {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  uploadedAt: number
  chunkCount: number
  charCount: number
}

export interface DocumentIndex {
  documents: DocumentMeta[]
  chunks: DocChunk[]
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true })
}

export async function loadIndex(): Promise<DocumentIndex> {
  await ensureDirs()
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8')
    const parsed = JSON.parse(raw) as DocumentIndex
    return {
      documents: parsed.documents ?? [],
      chunks: parsed.chunks ?? [],
    }
  } catch {
    return { documents: [], chunks: [] }
  }
}

async function saveIndex(index: DocumentIndex): Promise<void> {
  await ensureDirs()
  await fs.writeFile(INDEX_PATH, JSON.stringify(index), 'utf8')
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!cleaned) return []
  const chunks: string[] = []
  let i = 0
  while (i < cleaned.length) {
    const end = Math.min(i + size, cleaned.length)
    chunks.push(cleaned.slice(i, end).trim())
    if (end >= cleaned.length) break
    i = Math.max(0, end - overlap)
  }
  return chunks.filter(Boolean)
}

export async function extractText(filePath: string, originalName: string, mimeType: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase()
  const buf = await fs.readFile(filePath)

  if (ext === '.pdf' || mimeType === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buf })
    try {
      const result = await parser.getText()
      return result?.text || ''
    } finally {
      await parser.destroy().catch(() => undefined)
    }
  }

  if (['.txt', '.md', '.csv', '.json', '.tsv', '.log'].includes(ext) || mimeType.startsWith('text/')) {
    return buf.toString('utf8')
  }

  // Try utf8 for unknown text-like uploads
  const asText = buf.toString('utf8')
  if (asText.includes('\u0000')) {
    throw new Error(`Unsupported file type: ${ext || mimeType}. Upload PDF, TXT, MD, CSV, or JSON.`)
  }
  return asText
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY required to index documents')
  const client = new OpenAI({ apiKey })
  const embeddings: number[][] = []
  const batchSize = 64
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    })
    const ordered = [...res.data].sort((a, b) => a.index - b.index)
    for (const row of ordered) embeddings.push(row.embedding)
  }
  return embeddings
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const index = await loadIndex()
  return [...index.documents].sort((a, b) => b.uploadedAt - a.uploadedAt)
}

export async function ingestUploadedFile(input: {
  tempPath: string
  originalName: string
  mimeType: string
  size: number
}): Promise<DocumentMeta> {
  await ensureDirs()
  const id = uid('doc')
  const safeName = input.originalName.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120)
  const storedName = `${id}__${safeName}`
  const dest = path.join(FILES_DIR, storedName)
  await fs.copyFile(input.tempPath, dest)

  const text = await extractText(dest, input.originalName, input.mimeType)
  if (!text.trim()) {
    await fs.unlink(dest).catch(() => undefined)
    throw new Error('No extractable text found in that file.')
  }

  const pieces = chunkText(text)
  const vectors = await embedTexts(pieces)
  const chunks: DocChunk[] = pieces.map((piece, i) => ({
    id: uid('chunk'),
    documentId: id,
    filename: input.originalName,
    chunkIndex: i,
    text: piece,
    embedding: vectors[i],
  }))

  const meta: DocumentMeta = {
    id,
    filename: storedName,
    originalName: input.originalName,
    mimeType: input.mimeType || 'application/octet-stream',
    size: input.size,
    uploadedAt: Date.now(),
    chunkCount: chunks.length,
    charCount: text.length,
  }

  const index = await loadIndex()
  index.documents.push(meta)
  index.chunks.push(...chunks)
  await saveIndex(index)
  return meta
}

export async function deleteDocument(id: string): Promise<boolean> {
  const index = await loadIndex()
  const doc = index.documents.find((d) => d.id === id)
  if (!doc) return false
  index.documents = index.documents.filter((d) => d.id !== id)
  index.chunks = index.chunks.filter((c) => c.documentId !== id)
  await saveIndex(index)
  await fs.unlink(path.join(FILES_DIR, doc.filename)).catch(() => undefined)
  return true
}

export interface SearchHit {
  documentId: string
  filename: string
  chunkIndex: number
  quote: string
  score: number
}

export async function searchDocuments(query: string, limit = 5): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const index = await loadIndex()
  if (index.chunks.length === 0) return []

  const [queryVec] = await embedTexts([q])
  const scored = index.chunks.map((chunk) => ({
    documentId: chunk.documentId,
    filename: chunk.filename,
    chunkIndex: chunk.chunkIndex,
    quote: chunk.text,
    score: cosine(queryVec, chunk.embedding),
  }))

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .filter((h) => h.score > 0.15)
}
