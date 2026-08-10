import { BookOpen, Calculator, GitCompareArrows, ScrollText } from 'lucide-react'
import type { QuickAction } from '../types'
import { ChaiMark } from './ChaiMark'

const actions: { id: QuickAction; label: string; icon: typeof Calculator; tone: string }[] = [
  { id: 'depreciation', label: 'Depreciation', icon: Calculator, tone: 'peach' },
  { id: 'journal_entries', label: 'Journal entries', icon: ScrollText, tone: 'olive' },
  { id: 'book_vs_tax', label: 'Book vs tax', icon: GitCompareArrows, tone: 'gold' },
  { id: 'authority', label: 'Authorities', icon: BookOpen, tone: 'sage' },
]

interface ChatHeroProps {
  onQuickAction: (action: QuickAction) => void
}

export function ChatHero({ onQuickAction }: ChatHeroProps) {
  return (
    <div className="hero">
      <ChaiMark size={88} className="hero-mark" />
      <h1>Depreciation, journal entries, and book vs tax—worked carefully.</h1>
      <p className="hero-sub">
        Upload your files, and Chai searches them for quoted evidence. It also drafts balancing journal
        entries and runs tested depreciation math—with book and tax kept separate.
      </p>

      <div className="quick-actions">
        {actions.map(({ id, label, icon: Icon, tone }) => (
          <button
            key={id}
            type="button"
            className={`quick-card tone-${tone}`}
            onClick={() => onQuickAction(id)}
          >
            <span className="quick-icon">
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <p className="hero-disclaimer">
        Chai is an assistant, not a CPA. Verify entries and amounts before posting or filing.
      </p>
    </div>
  )
}
