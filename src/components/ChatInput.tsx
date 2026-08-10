import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Paperclip, SendHorizonal, Sparkles } from 'lucide-react'
import type { ModelId } from '../types'

const models: { id: ModelId; label: string; hint: string }[] = [
  { id: 'chai-1.0', label: 'Chai 1.0', hint: 'Balanced' },
  { id: 'chai-fast', label: 'Chai Fast', hint: 'Quicker replies' },
  { id: 'chai-deep', label: 'Chai Deep', hint: 'More thorough' },
]

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: (value: string) => void
  model: ModelId
  onModelChange: (model: ModelId) => void
  disabled?: boolean
  onAttach?: (file: File) => void
}

export function ChatInput({
  value,
  onChange,
  onSend,
  model,
  onModelChange,
  disabled,
  onAttach,
}: ChatInputProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [attachedName, setAttachedName] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const active = models.find((m) => m.id === model) ?? models[0]

  const submit = () => {
    if (!value.trim() || disabled) return
    onSend(value)
    setAttachedName(null)
  }

  return (
    <div className="composer-wrap">
      {attachedName && (
        <div className="attach-chip">
          Attached: {attachedName}
          <button type="button" onClick={() => setAttachedName(null)} aria-label="Remove attachment">
            ×
          </button>
        </div>
      )}
      <div className="composer">
        <button
          type="button"
          className="icon-btn"
          aria-label="Attach file"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setAttachedName(file.name)
            onAttach?.(file)
            e.target.value = ''
          }}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Ask Chai — it can search your uploaded files…"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />

        <div className="composer-actions" ref={menuRef}>
          <button
            type="button"
            className="model-pill"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Sparkles size={14} />
            {active.label}
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <ul className="model-menu" role="listbox">
              {models.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === model}
                    className={m.id === model ? 'is-selected' : ''}
                    onClick={() => {
                      onModelChange(m.id)
                      setMenuOpen(false)
                    }}
                  >
                    <span>{m.label}</span>
                    <small>{m.hint}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="send-btn"
            aria-label="Send message"
            disabled={disabled || !value.trim()}
            onClick={submit}
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
      <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
    </div>
  )
}
