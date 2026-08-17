import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Paperclip, SendHorizonal, Sparkles } from 'lucide-react'
import type { ModelId, ResponseMode, StudyPreference } from '../types'
import { RESPONSE_MODE_LABELS, STUDY_PREFERENCE_LABELS } from '../study/schemas'

const models: { id: ModelId; label: string; hint: string }[] = [
  { id: 'chai-1.0', label: 'Chai 1.0', hint: 'Balanced' },
  { id: 'chai-fast', label: 'Chai Fast', hint: 'Quicker replies' },
  { id: 'chai-deep', label: 'Chai Deep', hint: 'More thorough' },
]

const modes: { id: ResponseMode; label: string; hint: string }[] = [
  { id: 'professional', label: RESPONSE_MODE_LABELS.professional, hint: 'Concise technical answer' },
  {
    id: 'cpa_exam_study',
    label: RESPONSE_MODE_LABELS.cpa_exam_study,
    hint: 'Explain this like I’m studying for the CPA Exam',
  },
  { id: 'quick_answer', label: RESPONSE_MODE_LABELS.quick_answer, hint: 'Direct answer + score' },
]

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: (value: string) => void
  model: ModelId
  onModelChange: (model: ModelId) => void
  responseMode: ResponseMode
  onResponseModeChange: (mode: ResponseMode) => void
  studyPreference: StudyPreference
  onStudyPreferenceChange: (pref: StudyPreference) => void
  disabled?: boolean
  onAttach?: (file: File) => void
}

export function ChatInput({
  value,
  onChange,
  onSend,
  model,
  onModelChange,
  responseMode,
  onResponseModeChange,
  studyPreference,
  onStudyPreferenceChange,
  disabled,
  onAttach,
}: ChatInputProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [attachedName, setAttachedName] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
      if (!modeRef.current?.contains(e.target as Node)) setModeOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const active = models.find((m) => m.id === model) ?? models[0]
  const activeMode = modes.find((m) => m.id === responseMode) ?? modes[0]

  const submit = () => {
    if (!value.trim() || disabled) return
    onSend(value)
    setAttachedName(null)
  }

  return (
    <div className="composer-wrap">
      <div className="mode-bar">
        <div className="mode-selector" ref={modeRef}>
          <button
            type="button"
            className="mode-pill"
            aria-haspopup="listbox"
            aria-expanded={modeOpen}
            onClick={() => setModeOpen((o) => !o)}
          >
            Mode: {activeMode.label}
            <ChevronDown size={14} />
          </button>
          {modeOpen && (
            <ul className="model-menu mode-menu" role="listbox">
              {modes.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === responseMode}
                    className={m.id === responseMode ? 'is-selected' : ''}
                    onClick={() => {
                      onResponseModeChange(m.id)
                      setModeOpen(false)
                    }}
                  >
                    <span>{m.label}</span>
                    <small>{m.hint}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {responseMode === 'cpa_exam_study' && (
          <label className="study-pref">
            <span>How do you want to study?</span>
            <select
              value={studyPreference}
              onChange={(e) => onStudyPreferenceChange(e.target.value as StudyPreference)}
            >
              {(Object.keys(STUDY_PREFERENCE_LABELS) as StudyPreference[]).map((key) => (
                <option key={key} value={key}>
                  {STUDY_PREFERENCE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {responseMode === 'cpa_exam_study' && (
        <p className="mode-banner">Explain this like I’m studying for the CPA Exam</p>
      )}

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
          placeholder={
            responseMode === 'cpa_exam_study'
              ? 'Ask a CPA study question…'
              : 'Ask Chai — it can search your uploaded files…'
          }
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
      <p className="composer-hint">Enter to send · Shift+Enter for a new line · Mode can change between questions</p>
    </div>
  )
}
