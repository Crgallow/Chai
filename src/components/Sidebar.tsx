import {
  ChevronDown,
  ChevronRight,
  Files,
  MessageSquare,
  Plus,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react'
import type { Chat, UserProfile } from '../types'
import { ChaiWordmark } from './ChaiMark'

interface SidebarProps {
  recentChats: Chat[]
  activeChatId: string | null
  user: UserProfile
  showAll: boolean
  onToggleShowAll: () => void
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onOpenSettings: () => void
  onOpenDocuments: () => void
  onOpenGovernance: () => void
  onGoHome: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({
  recentChats,
  activeChatId,
  user,
  showAll,
  onToggleShowAll,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
  onOpenDocuments,
  onOpenGovernance,
  onGoHome,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const visible = showAll ? recentChats : recentChats.slice(0, 5)

  return (
    <>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={onCloseMobile} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <button type="button" className="brand-btn" onClick={onGoHome}>
          <ChaiWordmark light />
        </button>

        <button type="button" className="new-chat-btn" onClick={onNewChat}>
          <Plus size={18} strokeWidth={2.25} />
          New chat
        </button>

        <button type="button" className="files-link" onClick={onOpenDocuments}>
          <Files size={15} />
          Files
        </button>

        <button type="button" className="files-link" onClick={onOpenGovernance}>
          <Shield size={15} />
          Knowledge
        </button>
        <p className="sidebar-hint">Knowledge = IRC / ASC / PCAOB uploads</p>

        <div className="sidebar-section">
          <div className="sidebar-label">Recent chats</div>
          <ul className="chat-list">
            {visible.length === 0 && (
              <li className="chat-empty">No chats yet — start one below.</li>
            )}
            {visible.map((chat) => (
              <li key={chat.id} className={chat.id === activeChatId ? 'is-active' : ''}>
                <button type="button" className="chat-item" onClick={() => onSelectChat(chat.id)}>
                  <MessageSquare size={15} strokeWidth={1.75} />
                  <span>{chat.title}</span>
                </button>
                <button
                  type="button"
                  className="chat-delete"
                  aria-label={`Delete ${chat.title}`}
                  onClick={() => onDeleteChat(chat.id)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {recentChats.length > 5 && (
            <button type="button" className="view-all" onClick={onToggleShowAll}>
              {showAll ? 'Show less' : 'View all'}
              <ChevronRight size={14} className={showAll ? 'rotated' : ''} />
            </button>
          )}
        </div>

        <div className="sidebar-footer">
          <button type="button" className="user-chip" onClick={onOpenSettings}>
            <span className="avatar">{user.initials}</span>
            <span className="user-meta">
              <span className="user-name">{user.name}</span>
            </span>
            <ChevronDown size={16} />
          </button>
          <button type="button" className="settings-link" onClick={onOpenSettings}>
            <Settings size={15} />
            Settings
          </button>
        </div>
      </aside>
    </>
  )
}
