import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, Message, ModelId, QuickAction, StructuredAnswer, UserProfile } from '../types'
import { streamAssistantReply, promptForAction } from '../lib/ai'
import {
  loadActiveChatId,
  loadChats,
  loadModel,
  loadUser,
  saveActiveChatId,
  saveChats,
  saveModel,
  saveUser,
  titleFromPrompt,
  uid,
} from '../lib/storage'

export function useChats() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats())
  const [activeChatId, setActiveChatId] = useState<string | null>(() => loadActiveChatId())
  const [model, setModelState] = useState<ModelId>(() => loadModel())
  const [user, setUserState] = useState<UserProfile>(() => loadUser())
  const [isStreaming, setIsStreaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    saveChats(chats)
  }, [chats])

  useEffect(() => {
    saveActiveChatId(activeChatId)
  }, [activeChatId])

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  )

  const recentChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  )

  const setModel = useCallback((next: ModelId) => {
    setModelState(next)
    saveModel(next)
  }, [])

  const setUser = useCallback((next: UserProfile) => {
    setUserState(next)
    saveUser(next)
  }, [])

  const createChat = useCallback((title = 'New chat') => {
    const chat: Chat = {
      id: uid('chat'),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setChats((prev) => [chat, ...prev])
    setActiveChatId(chat.id)
    setDraft('')
    return chat
  }, [])

  const selectChat = useCallback((id: string) => {
    setActiveChatId(id)
    setDraft('')
  }, [])

  const goHome = useCallback(() => {
    setActiveChatId(null)
    setDraft('')
  }, [])

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (activeChatId === id) setActiveChatId(null)
    },
    [activeChatId],
  )

  const clearAllChats = useCallback(() => {
    setChats([])
    setActiveChatId(null)
  }, [])

  const patchAssistant = useCallback(
    (chatId: string, assistantId: string, patch: { content?: string; structured?: StructuredAnswer }) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: patch.content ?? m.content,
                        structured: patch.structured ?? m.structured,
                      }
                    : m,
                ),
                updatedAt: Date.now(),
              }
            : c,
        ),
      )
    },
    [],
  )

  const sendMessage = useCallback(
    async (raw: string) => {
      const content = raw.trim()
      if (!content || isStreaming) return

      let chatId = activeChatId
      let workingMessages: Message[] = activeChat?.messages ?? []

      if (!chatId) {
        const chat = createChat(titleFromPrompt(content))
        chatId = chat.id
        workingMessages = []
      }

      const userMsg: Message = {
        id: uid('msg'),
        role: 'user',
        content,
        createdAt: Date.now(),
      }

      const assistantId = uid('msg')
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      }

      workingMessages = [...workingMessages, userMsg, assistantMsg]

      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                title: c.messages.length === 0 ? titleFromPrompt(content) : c.title,
                messages: workingMessages,
                updatedAt: Date.now(),
              }
            : c,
        ),
      )
      setActiveChatId(chatId)
      setDraft('')
      setIsStreaming(true)
      setStatusLine('Planning accounting workflow…')

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        let assembled = ''
        const historyForModel = workingMessages.slice(0, -1)
        for await (const event of streamAssistantReply(
          content,
          model,
          historyForModel,
          controller.signal,
          (line) => setStatusLine(line),
        )) {
          if (event.type === 'text' && event.value) {
            setStatusLine(null)
            assembled += event.value
            patchAssistant(chatId, assistantId, { content: assembled })
          } else if (event.type === 'done') {
            patchAssistant(chatId, assistantId, {
              content: assembled,
              structured: event.structured,
            })
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const message =
          err instanceof Error ? err.message : 'Something went wrong talking to OpenAI.'
        patchAssistant(chatId, assistantId, {
          content: `Chai hit an error: ${message}`,
        })
      } finally {
        setIsStreaming(false)
        setStatusLine(null)
      }
    },
    [activeChat, activeChatId, createChat, isStreaming, model, patchAssistant],
  )

  const startQuickAction = useCallback((action: QuickAction) => {
    setDraft(promptForAction(action))
  }, [])

  return {
    chats,
    recentChats,
    activeChat,
    activeChatId,
    model,
    setModel,
    user,
    setUser,
    draft,
    setDraft,
    isStreaming,
    statusLine,
    createChat,
    selectChat,
    goHome,
    deleteChat,
    clearAllChats,
    sendMessage,
    startQuickAction,
  }
}
