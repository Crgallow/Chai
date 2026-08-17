import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { UserProfile } from '../types'

interface SettingsModalProps {
  open: boolean
  user: UserProfile
  onClose: () => void
  onSave: (user: UserProfile) => void
  onClearChats: () => void
  onOpenGovernance?: () => void
}

export function SettingsModal({
  open,
  user,
  onClose,
  onSave,
  onClearChats,
  onOpenGovernance,
}: SettingsModalProps) {
  const [name, setName] = useState(user.name)
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(() => {
    if (open) setName(user.name)
  }, [open, user.name])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((data: { ok?: boolean; hasOpenAiKey?: boolean }) => {
        if (cancelled) return
        setServerOk(Boolean(data.ok))
        setHasKey(Boolean(data.hasOpenAiKey))
      })
      .catch(() => {
        if (cancelled) return
        setServerOk(false)
        setHasKey(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'CK'

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>

        <div className="disclaimer-box" style={{ marginTop: '1rem' }}>
          <strong>OpenAI key (server only)</strong>
          <p>
            The secret key stays on the Chai middleman server — visitors cannot read it from the website.
            Put <code>OPENAI_API_KEY=sk-…</code> in a local <code>.env</code> file (see{' '}
            <code>.env.example</code>), then restart the server.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            {serverOk === null && 'Checking server…'}
            {serverOk === false && 'Server not reachable. Run npm run dev (starts website + middleman).'}
            {serverOk === true && hasKey === true && 'Server is up and the OpenAI key is configured.'}
            {serverOk === true && hasKey === false && 'Server is up, but OPENAI_API_KEY is missing.'}
          </p>
        </div>

        <div className="disclaimer-box">
          <strong>Professional disclaimer</strong>
          <p>
            Chai uses OpenAI for reasoning and tested code for depreciation arithmetic. It is not a CPA,
            attorney, or formal tax advisor. Always verify against IRS, FASB, and firm guidance before
            filing or booking entries.
          </p>
        </div>

        {onOpenGovernance && (
          <div className="disclaimer-box">
            <strong>Knowledge Governance</strong>
            <p>Upload and approve IRC / ASC / PCAOB and other authoritative sources (admin token required).</p>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '0.65rem' }}
              onClick={() => {
                onClose()
                onOpenGovernance()
              }}
            >
              Open Knowledge Governance
            </button>
          </div>
        )}

        <div className="modal-actions modal-actions-wrap">
          <button
            type="button"
            className="btn-secondary danger"
            onClick={() => {
              if (confirm('Delete all chats on this device?')) onClearChats()
            }}
          >
            Clear all chats
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onSave({ name: name.trim() || user.name, initials })
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
