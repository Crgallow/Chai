/**
 * Lightweight intent gate: conversational chat vs accounting research.
 * Prefer false negatives (chat) over forcing research on "does it work?".
 */
const ACCOUNTING_RE =
  /\b(tax|irs|irc|asc|gaap|ifrs|pcaob|aicpa|audit|auditor|depreciat|macrs|section\s*179|bonus\s*depreciation|journal\s*entr|debit|credit|ledger|balance\s*sheet|income\s*statement|1040|w-2|w-9|withhold|payroll|ein|itin|deferred\s*tax|book\s*vs\s*tax|reconcile|materiality|going\s*concern|internal\s*control|sox|asc\s*\d|reg\s*\d|far\b|aud\b|cpa\s*exam|form\s*\d|publication\s*\d|pub\s*\d+|treasury\s*reg|revenue\s*ruling|schedule\s*[a-z]|basis\b|carryover|nol\b|partnership|s[\s-]?corp|c[\s-]?corp|fiduciary|estate\s*tax|gift\s*tax|amortiz|impairment|fair\s*value|lease\s*account|revenue\s*recogni|asc\s*606|inventory|fifo|lifo|lcm)\b/i

const CONVERSATIONAL_RE =
  /^(hi|hey|hello|thanks|thank you|ok|okay|yo|sup|good\s*(morning|afternoon|evening)|how are you|what can you do|who are you|does (this|it) work|are you (working|there|up)|test(ing)?|ping|help)\b/i

export function isAccountingResearchQuestion(question: string): boolean {
  const q = question.trim()
  if (!q) return false
  if (q.length < 12 && CONVERSATIONAL_RE.test(q)) return false
  if (CONVERSATIONAL_RE.test(q) && !ACCOUNTING_RE.test(q)) return false
  if (ACCOUNTING_RE.test(q)) return true
  // Longer questions that look like homework / fact patterns
  if (
    q.length > 80 &&
    /\b(should|how much|what is|calculate|compute|is it|are we|does the|under|according)\b/i.test(q)
  ) {
    return true
  }
  return false
}
