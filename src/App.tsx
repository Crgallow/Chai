import { useState } from 'react'
import { Menu } from 'lucide-react'
import { ChatHero } from './components/ChatHero'
import { ChatInput } from './components/ChatInput'
import { ChatMessages } from './components/ChatMessages'
import { DocumentsModal } from './components/DocumentsModal'
import { KnowledgeGovernanceModal } from './components/governance/KnowledgeGovernanceModal'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { useChats } from './hooks/useChats'
import './App.css'

export default function App() {
  const {
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
  } = useChats()

  const [showAll, setShowAll] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [governanceOpen, setGovernanceOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)

  const showHero = !activeChat || activeChat.messages.length === 0

  return (
    <div className="app-shell">
      <Sidebar
        recentChats={recentChats}
        activeChatId={activeChatId}
        user={user}
        showAll={showAll}
        onToggleShowAll={() => setShowAll((v) => !v)}
        onNewChat={() => {
          createChat()
          setMobileOpen(false)
        }}
        onSelectChat={(id) => {
          selectChat(id)
          setMobileOpen(false)
        }}
        onDeleteChat={deleteChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenDocuments={() => {
          setDocumentsOpen(true)
          setMobileOpen(false)
        }}
        onOpenGovernance={() => {
          setGovernanceOpen(true)
          setMobileOpen(false)
        }}
        onGoHome={() => {
          goHome()
          setMobileOpen(false)
        }}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <main className="workspace">
        <header className="mobile-bar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <span className="mobile-title">Chai</span>
          <span className="mobile-spacer" />
        </header>

        <div className="workspace-body">
          {showHero ? (
            <ChatHero onQuickAction={(action) => startQuickAction(action)} />
          ) : (
            <ChatMessages
              messages={activeChat!.messages}
              isStreaming={isStreaming}
              statusLine={statusLine}
            />
          )}
        </div>

        {uploadNote && <p className="upload-note">{uploadNote}</p>}

        <p className="workspace-disclaimer">
          Assistant only — not a CPA. Approved knowledge first; official-site fallback is disclosed. Verify before posting.
        </p>

        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={sendMessage}
          model={model}
          onModelChange={setModel}
          disabled={isStreaming}
          onAttach={async (file) => {
            setUploadNote(`Indexing ${file.name}…`)
            try {
              const body = new FormData()
              body.append('file', file)
              const res = await fetch('/api/documents', { method: 'POST', body })
              const data = (await res.json()) as { error?: string }
              if (!res.ok) throw new Error(data.error || 'Upload failed')
              setUploadNote(`Indexed ${file.name}. Ask about it in chat — Chai will quote the file.`)
              setDraft((prev) =>
                prev
                  ? `${prev}\n\n(Using uploaded file: ${file.name})`
                  : `Using my uploaded file “${file.name}”, find the relevant passages and quote them.`,
              )
            } catch (err) {
              setUploadNote(err instanceof Error ? err.message : 'Upload failed')
            }
          }}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        user={user}
        onClose={() => setSettingsOpen(false)}
        onSave={setUser}
        onClearChats={() => {
          clearAllChats()
          setSettingsOpen(false)
        }}
      />

      <DocumentsModal open={documentsOpen} onClose={() => setDocumentsOpen(false)} />
      <KnowledgeGovernanceModal open={governanceOpen} onClose={() => setGovernanceOpen(false)} />
    </div>
  )
}
