import { useEffect, useRef } from 'react'
import type { Message, ResponseMode } from '../types'
import { ChaiMark } from './ChaiMark'
import { StructuredAnswerCard } from './StructuredAnswerCard'

interface ChatMessagesProps {
  messages: Message[]
  isStreaming: boolean
  statusLine?: string | null
  chatId?: string
  onExpandMode?: (mode: ResponseMode) => void
}

export function ChatMessages({
  messages,
  isStreaming,
  statusLine,
  chatId,
  onExpandMode,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isStreaming, statusLine])

  return (
    <div className="messages" role="log" aria-live="polite">
      {messages.map((message, index) => {
        const isLastAssistant =
          message.role === 'assistant' && index === messages.length - 1 && isStreaming
        const priorUser = [...messages]
          .slice(0, index)
          .reverse()
          .find((m) => m.role === 'user')
        return (
          <article key={message.id} className={`message message-${message.role}`}>
            {message.role === 'assistant' && (
              <div className="message-avatar">
                <ChaiMark size={28} />
              </div>
            )}
            <div className="message-bubble">
              <div className="message-role">
                {message.role === 'user' ? 'You' : 'Chai'}
                {message.responseMode === 'cpa_exam_study' && (
                  <span className="mode-chip">CPA Study</span>
                )}
                {message.responseMode === 'quick_answer' && (
                  <span className="mode-chip">Quick</span>
                )}
              </div>
              <div className="message-body">
                {message.content || (isLastAssistant ? statusLine || '' : '…')}
                {isLastAssistant && <span className="caret" aria-hidden />}
              </div>
              {message.role === 'assistant' && message.structured && (
                <StructuredAnswerCard
                  structured={message.structured}
                  chatId={chatId}
                  messageId={message.id}
                  prompt={priorUser?.content}
                  onExpandMode={onExpandMode}
                />
              )}
            </div>
          </article>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
