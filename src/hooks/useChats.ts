import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Chat,
  Message,
  ModelId,
  QuickAction,
  ResponseMode,
  StructuredAnswer,
  StudyPreference,
  UserProfile,
} from '../types'
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
import {
  loadResponseMode,
  loadStudyPreference,
  saveResponseMode,
  saveStudyPreference,
} from '../study/persistence'

export function useChats() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats())
  const [activeChatId, setActiveChatId] = useState<string | null>(() => loadActiveChatId())
  const [model, setModelState] = useState<ModelId>(() => loadModel())
  const [user, setUserState] = useState<UserProfile>(() => loadUser())
  const [responseMode, setResponseModeState] = useState<ResponseMode>(() => loadResponseMode())
  const [studyPreference, setStudyPreferenceState] = useState<StudyPreference>(() =>
    loadStudyPreference(),
  )
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

  const setResponseMode = useCallback((next: ResponseMode) => {
    setResponseModeState(next)
    saveResponseMode(next)
    setChats((prev) =>
      prev.map((c) => (c.id === activeChatId ? { ...c, responseMode: next, updatedAt: Date.now() } : c)),
    )
  }, [activeChatId])

  const setStudyPreference = useCallback((next: StudyPreference) => {
    setStudyPreferenceState(next)
    saveStudyPreference(next)
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, studyPreference: next, updatedAt: Date.now() } : c,
      ),
    )
  }, [activeChatId])

  const createChat = useCallback((title = 'New chat') => {
    const chat: Chat = {
      id: uid('chat'),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      responseMode,
      studyPreference,
    }
    setChats((prev) => [chat, ...prev])
    setActiveChatId(chat.id)
    setDraft('')
    return chat
  }, [responseMode, studyPreference])

  const selectChat = useCallback((id: string) => {
    setActiveChatId(id)
    setDraft('')
    const chat = loadChats().find((c) => c.id === id)
    if (chat?.responseMode) {
      setResponseModeState(chat.responseMode)
      saveResponseMode(chat.responseMode)
    }
    if (chat?.studyPreference) {
      setStudyPreferenceState(chat.studyPreference)
      saveStudyPreference(chat.studyPreference)
    }
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
    async (raw: string, modeOverride?: ResponseMode) => {
      const content = raw.trim()
      if (!content || isStreaming) return
      const mode = modeOverride ?? responseMode

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
        responseMode: mode,
        studyPreference: mode === 'cpa_exam_study' ? studyPreference : undefined,
      }

      const assistantId = uid('msg')
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        responseMode: mode,
        studyPreference: mode === 'cpa_exam_study' ? studyPreference : undefined,
      }

      workingMessages = [...workingMessages, userMsg, assistantMsg]

      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                title: c.messages.length === 0 ? titleFromPrompt(content) : c.title,
                messages: workingMessages,
                responseMode: mode,
                studyPreference: mode === 'cpa_exam_study' ? studyPreference : c.studyPreference,
                updatedAt: Date.now(),
              }
            : c,
        ),
      )
      setActiveChatId(chatId)
      setDraft('')
      setIsStreaming(true)
      setStatusLine(
        mode === 'cpa_exam_study'
          ? 'Preparing CPA study walkthrough…'
          : 'Planning accounting workflow…',
      )

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
          {
            mode,
            studyPreference: mode === 'cpa_exam_study' ? studyPreference : undefined,
            onResearchRun: (run) => {
              setChats((prev) =>
                prev.map((c) =>
                  c.id === chatId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantId
                            ? {
                                ...m,
                                structured: {
                                  ...(m.structured ?? {}),
                                  researchProcess: run,
                                },
                              }
                            : m,
                        ),
                        updatedAt: Date.now(),
                      }
                    : c,
                ),
              )
            },
          },
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
    [
      activeChat,
      activeChatId,
      createChat,
      isStreaming,
      model,
      patchAssistant,
      responseMode,
      studyPreference,
    ],
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
    responseMode,
    setResponseMode,
    studyPreference,
    setStudyPreference,
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
