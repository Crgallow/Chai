import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DocumentChunk, KnowledgeSource } from '../schemas.ts'
import { uid } from '../store/jsonStore.ts'

export interface StoredDocument {
  absolutePath: string
  originalFileName: string
  mimeType: string
}

export interface ExtractedDocument {
  text: string
  pages?: string[]
}

export interface IndexingResult {
  status: 'indexed' | 'failed'
  chunkCount: number
  error?: string
  provider: 'mock_local' | 'live_embeddings'
}

export interface DocumentProcessor {
  extract(document: StoredDocument): Promise<ExtractedDocument>
  chunk(document: ExtractedDocument, source: KnowledgeSource): Promise<DocumentChunk[]>
  index(chunks: DocumentChunk[]): Promise<IndexingResult>
}

const ALLOWED_EXT = new Set(['.pdf', '.docx', '.txt', '.md', '.csv', '.xlsx', '.tsv', '.log'])
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/octet-stream',
])

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

export function validateUpload(fileName: string, mimeType: string, size: number): void {
  const ext = path.extname(fileName).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported extension ${ext}. Allowed: PDF, DOCX, TXT, MD, CSV, XLSX.`)
  }
  if (mimeType && !ALLOWED_MIME.has(mimeType) && !mimeType.startsWith('text/')) {
    throw new Error(`Unsupported MIME type: ${mimeType}`)
  }
  if (size > MAX_UPLOAD_BYTES) throw new Error('File exceeds maximum size (12MB).')
  if (/\.(exe|bat|cmd|ps1|js|mjs|cjs|sh|dll|com)$/i.test(fileName)) {
    throw new Error('Executable uploads are not allowed.')
  }
}

export function safeFileName(original: string): string {
  return original.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 120)
}

export async function checksumFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export class LocalDocumentProcessor implements DocumentProcessor {
  async extract(document: StoredDocument): Promise<ExtractedDocument> {
    const ext = path.extname(document.originalFileName).toLowerCase()
    const buf = await fs.readFile(document.absolutePath)

    if (ext === '.pdf' || document.mimeType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buf })
      try {
        const result = await parser.getText()
        return { text: result?.text || '' }
      } finally {
        await parser.destroy().catch(() => undefined)
      }
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: buf })
      return { text: result.value || '' }
    }

    if (ext === '.xlsx') {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'buffer' })
      const text = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name]
        return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`
      }).join('\n\n')
      return { text }
    }

    return { text: buf.toString('utf8') }
  }

  async chunk(document: ExtractedDocument, source: KnowledgeSource): Promise<DocumentChunk[]> {
    const cleaned = document.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    if (!cleaned) return []
    const size = 900
    const overlap = 120
    const chunks: DocumentChunk[] = []
    let i = 0
    let index = 0
    while (i < cleaned.length) {
      const end = Math.min(i + size, cleaned.length)
      const text = cleaned.slice(i, end).trim()
      if (text) {
        chunks.push({
          id: uid('chunk'),
          sourceId: source.id,
          chunkIndex: index,
          text,
          page: Math.floor(index / 3) + 1,
          section: source.topic || source.category,
          paragraph: `p${index + 1}`,
          headingHierarchy: [source.publisher, source.title].filter(Boolean),
          applicableYear: source.taxYear,
          jurisdiction: source.jurisdiction,
          effectiveDate: source.effectiveDate,
          authorityLevel: source.authorityLevel,
          documentStatus: source.status,
          startOffset: i,
          endOffset: end,
        })
        index++
      }
      if (end >= cleaned.length) break
      i = Math.max(0, end - overlap)
    }
    return chunks
  }

  async index(chunks: DocumentChunk[]): Promise<IndexingResult> {
    // Deterministic local index only — not production semantic retrieval.
    return {
      status: chunks.length ? 'indexed' : 'failed',
      chunkCount: chunks.length,
      error: chunks.length ? undefined : 'No extractable text to index',
      provider: 'mock_local',
    }
  }
}
