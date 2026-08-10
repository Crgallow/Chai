import { useEffect, useRef } from 'react'
import type { Message } from '../types'
import { ChaiMark } from './ChaiMark'
import { StructuredAnswerCard } from './StructuredAnswerCard'

interface ChatMessagesProps {
  messages: Message[]
  isStreaming: boolean
  statusLine?: string | null
}

export function ChatMessages({ messages, isStreaming, statusLine }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isStreaming, statusLine])

  return (
    <div className="messages" role="log" aria-live="polite">
      {messages.map((message, index) => {
        const isLastAssistant =
          message.role === 'assistant' && index === messages.length - 1 && isStreaming
        return (
          <article key={message.id} className={`message message-${message.role}`}>
            {message.role === 'assistant' && (
              <div className="message-avatar">
                <ChaiMark size={28} />
              </div>
            )}
            <div className="message-bubble">
              <div className="message-role">{message.role === 'user' ? 'You' : 'Chai'}</div>
              <div className="message-body">
                {message.content || (isLastAssistant ? statusLine || '' : '…')}
                {isLastAssistant && <span className="caret" aria-hidden />}
              </div>
              {message.role === 'assistant' && message.structured && (
                <StructuredAnswerCard structured={message.structured} />
              )}
            </div>
          </article>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
