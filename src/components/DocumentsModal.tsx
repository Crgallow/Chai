import { useEffect, useRef, useState } from 'react'
import { FileUp, Trash2, X } from 'lucide-react'

export interface DocListItem {
  id: string
  originalName: string
  size: number
  chunkCount: number
  uploadedAt: number
}

interface DocumentsModalProps {
  open: boolean
  onClose: () => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsModal({ open, onClose }: DocumentsModalProps) {
  const [docs, setDocs] = useState<DocListItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const res = await fetch('/api/documents')
    const data = (await res.json()) as { documents?: DocListItem[]; error?: string }
    if (!res.ok) throw new Error(data.error || 'Could not load documents')
    setDocs(data.documents ?? [])
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    refresh().catch((err: Error) => setError(err.message))
  }, [open])

  if (!open) return null

  const onUpload = async (file: File) => {
    setBusy(true)
    setError(null)
    setStatus(`Indexing ${file.name}…`)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/documents', { method: 'POST', body })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      await refresh()
      setStatus(`Indexed ${file.name}. Chai can search it in chat.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus(null)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="docs-title">Files</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="field-hint" style={{ marginTop: 0 }}>
          Upload PDFs or text files (TXT, MD, CSV, JSON). Chai indexes them on the server and searches
          for relevant passages, then cites them with quotes.
        </p>

        <div className="docs-upload-row">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,.tsv,.log,text/plain,application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onUpload(file)
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FileUp size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {busy ? 'Working…' : 'Upload file'}
          </button>
        </div>

        {status && <p className="field-hint">{status}</p>}
        {error && <p className="docs-error">{error}</p>}

        <ul className="docs-list">
          {docs.length === 0 && <li className="chat-empty">No files yet.</li>}
          {docs.map((doc) => (
            <li key={doc.id}>
              <div>
                <strong>{doc.originalName}</strong>
                <span>
                  {formatBytes(doc.size)} · {doc.chunkCount} chunks
                </span>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${doc.originalName}`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                    if (!res.ok) {
                      const data = (await res.json()) as { error?: string }
                      throw new Error(data.error || 'Delete failed')
                    }
                    await refresh()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Delete failed')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
