import type { Chat, UserProfile, ModelId } from '../types'

const CHATS_KEY = 'chai.chats'
const ACTIVE_KEY = 'chai.activeChatId'
const MODEL_KEY = 'chai.model'
const USER_KEY = 'chai.user'

const defaultUser: UserProfile = {
  name: 'Aanya Kapoor',
  initials: 'AK',
}

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Chat[]
  } catch {
    return []
  }
}

export function saveChats(chats: Chat[]): void {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats))
}

export function loadActiveChatId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveChatId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function loadModel(): ModelId {
  const value = localStorage.getItem(MODEL_KEY)
  if (value === 'chai-fast' || value === 'chai-deep' || value === 'chai-1.0') {
    return value
  }
  return 'chai-1.0'
}

export function saveModel(model: ModelId): void {
  localStorage.setItem(MODEL_KEY, model)
}

export function loadUser(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return defaultUser
    return { ...defaultUser, ...(JSON.parse(raw) as UserProfile) }
  } catch {
    return defaultUser
  }
}

export function saveUser(user: UserProfile): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New chat'
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trim()}…` : cleaned
}
