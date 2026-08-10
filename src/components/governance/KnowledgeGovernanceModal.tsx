import { useEffect, useMemo, useRef, useState } from 'react'
import { Shield, X } from 'lucide-react'
import type { KnowledgeSource } from '../../knowledge/schemas'

const TOKEN_KEY = 'chai.adminToken'

type Tab =
  | 'dashboard'
  | 'upload'
  | 'review'
  | 'allowlist'
  | 'external'
  | 'audit'
  | 'test'

interface KnowledgeGovernanceModalProps {
  open: boolean
  onClose: () => void
}

function badges(s: KnowledgeSource): string[] {
  const b: string[] = [s.status, s.indexingStatus, s.verificationStatus, s.authorityLevel]
  if (s.sourceType === 'organization_policy') b.push('Internal policy')
  if (['restricted', 'unknown', 'permission_required'].includes(s.licensingStatus)) {
    b.push('Licensing restricted')
  }
  return b
}

export function KnowledgeGovernanceModal({ open, onClose }: KnowledgeGovernanceModalProps) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [allowlist, setAllowlist] = useState<{ domain: string; publisher?: string; enabled: boolean }[]>([])
  const [audit, setAudit] = useState<unknown[]>([])
  const [external, setExternal] = useState<unknown[]>([])
  const [testQuery, setTestQuery] = useState('MACRS 5-year half-year 2025')
  const [testHits, setTestHits] = useState<unknown[]>([])
  const [preview, setPreview] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(
    () => ({
      'X-Chai-Admin-Token': token,
      'Content-Type': 'application/json',
    }),
    [token],
  )

  const refreshSources = async () => {
    const res = await fetch('/api/knowledge/sources')
    const data = await res.json()
    setSources(data.sources || [])
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    refreshSources().catch((e: Error) => setError(e.message))
  }, [open])

  if (!open) return null

  const saveToken = () => {
    sessionStorage.setItem(TOKEN_KEY, token)
    setStatus('Admin token saved for this browser session only.')
  }

  const adminFetch = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? { 'X-Chai-Admin-Token': token } : headers),
        ...(init?.headers || {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide governance-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            <Shield size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
            Knowledge Governance
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="field-hint" style={{ marginTop: 0 }}>
          Admin-only approved accounting sources. Purchasing access to material does not necessarily grant
          commercial AI, reproduction, or redistribution rights. Retrieval is <strong>mock/local</strong> until
          a live provider is configured.
        </p>

        <div className="gov-token-row">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="CHAI_ADMIN_TOKEN"
          />
          <button type="button" className="btn-secondary" onClick={saveToken}>
            Save token
          </button>
        </div>

        <div className="gov-tabs">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['upload', 'Upload'],
              ['review', 'Review'],
              ['allowlist', 'Domains'],
              ['external', 'External'],
              ['audit', 'Audit'],
              ['test', 'Test retrieval'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="docs-error">{error}</p>}
        {status && <p className="field-hint">{status}</p>}

        {tab === 'dashboard' && (
          <div className="gov-panel">
            <p className="field-hint">
              {sources.length} sources · approved {sources.filter((s) => s.status === 'approved').length} ·
              pending {sources.filter((s) => s.status === 'pending_review').length}
            </p>
            <ul className="docs-list">
              {sources.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{s.title}</strong>
                    <span>
                      {s.publisher} · {badges(s).join(' · ')}
                    </span>
                    <div className="badge-row">
                      {badges(s).map((b) => (
                        <span key={b} className="gov-badge">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="gov-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={async () => {
                        try {
                          const data = await adminFetch(`/api/knowledge/sources/${s.id}/preview`)
                          setPreview(data.source?.extractedTextPreview || '(no extracted text)')
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Preview failed')
                        }
                      }}
                    >
                      Preview
                    </button>
                    {s.indexingStatus === 'failed' && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={async () => {
                          await adminFetch(`/api/knowledge/sources/${s.id}/reindex`, { method: 'POST', body: '{}' })
                          await refreshSources()
                        }}
                      >
                        Retry index
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {preview && (
              <pre className="gov-preview">{preview}</pre>
            )}
          </div>
        )}

        {tab === 'upload' && (
          <div className="gov-panel">
            <p className="field-hint">Upload PDF/DOCX/TXT/MD/CSV/XLSX. Starts as draft — submit for review.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setError(null)
                try {
                  const body = new FormData()
                  body.append('file', file)
                  body.append(
                    'meta',
                    JSON.stringify({
                      publisher: 'Admin upload',
                      title: file.name,
                      sourceType: 'authoritative',
                      category: 'tax',
                      authorityLevel: 'official_guidance',
                      licensingStatus: 'public',
                      jurisdiction: 'US-federal',
                      taxYear: 2025,
                      organizationId: 'platform',
                    }),
                  )
                  const res = await fetch('/api/knowledge/sources/upload', {
                    method: 'POST',
                    headers: { 'X-Chai-Admin-Token': token },
                    body,
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error || 'Upload failed')
                  setStatus(`Uploaded draft ${data.source.id}`)
                  await refreshSources()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload failed')
                } finally {
                  e.target.value = ''
                }
              }}
            />
          </div>
        )}

        {tab === 'review' && (
          <div className="gov-panel">
            <ul className="docs-list">
              {sources
                .filter((s) => s.status === 'pending_review' || s.status === 'draft')
                .map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.title}</strong>
                      <span>
                        {s.status} · created by {s.createdBy}
                      </span>
                    </div>
                    <div className="gov-actions">
                      {s.status === 'draft' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            await adminFetch(`/api/knowledge/sources/${s.id}/submit`, {
                              method: 'POST',
                              body: '{}',
                            })
                            await refreshSources()
                          }}
                        >
                          Submit
                        </button>
                      )}
                      {s.status === 'pending_review' && (
                        <>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={async () => {
                              await adminFetch(`/api/knowledge/sources/${s.id}/review`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  decision: 'approved',
                                  reason: 'Meets metadata and licensing checks',
                                  actor: 'reviewer',
                                }),
                              })
                              await refreshSources()
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-secondary danger"
                            onClick={async () => {
                              await adminFetch(`/api/knowledge/sources/${s.id}/review`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  decision: 'rejected',
                                  reason: 'Insufficient metadata or licensing',
                                  actor: 'reviewer',
                                }),
                              })
                              await refreshSources()
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={async () => {
                          await adminFetch(`/api/knowledge/sources/${s.id}/disable`, {
                            method: 'POST',
                            body: JSON.stringify({ reason: 'Disabled by admin' }),
                          })
                          await refreshSources()
                        }}
                      >
                        Disable
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {tab === 'allowlist' && (
          <div className="gov-panel">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                const data = await adminFetch('/api/knowledge/allowlist')
                setAllowlist(data.allowlist || [])
              }}
            >
              Load allowlist
            </button>
            <ul className="docs-list">
              {allowlist.map((a) => (
                <li key={a.domain}>
                  <div>
                    <strong>{a.domain}</strong>
                    <span>
                      {a.publisher} · {a.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'external' && (
          <div className="gov-panel">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                const data = await adminFetch('/api/knowledge/external-candidates')
                setExternal(data.candidates || [])
              }}
            >
              Load external review queue
            </button>
            <ul className="docs-list">
              {(external as { id: string; title: string; url: string; status: string }[]).map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.title}</strong>
                    <span>
                      {c.status} · {c.url}
                    </span>
                  </div>
                  {c.status === 'pending_review' && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={async () => {
                        await adminFetch(`/api/knowledge/external-candidates/${c.id}/promote`, {
                          method: 'POST',
                          body: JSON.stringify({ reason: 'Promote for KB intake review' }),
                        })
                        const data = await adminFetch('/api/knowledge/external-candidates')
                        setExternal(data.candidates || [])
                      }}
                    >
                      Promote
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'audit' && (
          <div className="gov-panel">
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                const data = await adminFetch('/api/knowledge/audit')
                setAudit(data.records || [])
              }}
            >
              Load audit log
            </button>
            <ul className="docs-list">
              {(audit as { id: string; action: string; target: string; timestamp: string; result: string }[]).map(
                (r) => (
                  <li key={r.id}>
                    <div>
                      <strong>{r.action}</strong>
                      <span>
                        {r.timestamp} · {r.target} · {r.result}
                      </span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

        {tab === 'test' && (
          <div className="gov-panel">
            <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const data = await adminFetch('/api/knowledge/test-retrieval', {
                  method: 'POST',
                  body: JSON.stringify({ query: testQuery, taxYear: 2025, allowHistoricalSuperseded: true }),
                })
                setTestHits(data.hits || [])
                setStatus(`Mock retrieval returned ${(data.hits || []).length} hits`)
              }}
            >
              Run mock retrieval test
            </button>
            <ul className="docs-list">
              {(testHits as { source: { title: string }; chunk: { text: string }; score: number }[]).map(
                (h, i) => (
                  <li key={i}>
                    <div>
                      <strong>{h.source.title}</strong>
                      <span>
                        score {h.score.toFixed(2)} · “{h.chunk.text.slice(0, 160)}…”
                      </span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
