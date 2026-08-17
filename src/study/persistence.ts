import { uid } from '../lib/storage.ts'
import type {
  AttemptCorrectness,
  ReviewTopic,
  SavedStudyQuestion,
  StudyAttempt,
  StudyPreference,
  ResponseMode,
  ExamSection,
} from './schemas.ts'
import { ResponseModeSchema, StudyPreferenceSchema } from './schemas.ts'

const MODE_KEY = 'chai.responseMode'
const PREF_KEY = 'chai.studyPreference'
const SAVED_KEY = 'chai.savedStudyQuestions'
const ATTEMPTS_KEY = 'chai.studyAttempts'
const REVIEW_KEY = 'chai.reviewTopics'

export function loadResponseMode(): ResponseMode {
  const raw = localStorage.getItem(MODE_KEY)
  const parsed = ResponseModeSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'professional'
}

export function saveResponseMode(mode: ResponseMode): void {
  localStorage.setItem(MODE_KEY, mode)
}

export function loadStudyPreference(): StudyPreference {
  const raw = localStorage.getItem(PREF_KEY)
  const parsed = StudyPreferenceSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'walk_through'
}

export function saveStudyPreference(pref: StudyPreference): void {
  localStorage.setItem(PREF_KEY, pref)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadSavedStudyQuestions(): SavedStudyQuestion[] {
  return readJson(SAVED_KEY, [])
}

export function saveStudyQuestion(input: {
  prompt: string
  topic: string
  examSection?: ExamSection
  chatId?: string
  messageId?: string
}): SavedStudyQuestion {
  const row: SavedStudyQuestion = {
    id: uid('saved'),
    prompt: input.prompt,
    topic: input.topic,
    examSection: input.examSection,
    chatId: input.chatId,
    messageId: input.messageId,
    understood: false,
    savedAt: new Date().toISOString(),
  }
  const next = [row, ...loadSavedStudyQuestions().filter((q) => q.prompt !== input.prompt)]
  localStorage.setItem(SAVED_KEY, JSON.stringify(next))
  return row
}

export function markSavedUnderstood(id: string, understood = true): void {
  const next = loadSavedStudyQuestions().map((q) => (q.id === id ? { ...q, understood } : q))
  localStorage.setItem(SAVED_KEY, JSON.stringify(next))
}

export function loadStudyAttempts(): StudyAttempt[] {
  return readJson(ATTEMPTS_KEY, [])
}

export function recordStudyAttempt(input: {
  questionId: string
  chatId?: string
  messageId?: string
  userAnswer: string
  correctness: AttemptCorrectness
  mistakeCategory?: string
  mistakeExplanation?: string
}): StudyAttempt {
  const row: StudyAttempt = {
    id: uid('attempt'),
    questionId: input.questionId,
    chatId: input.chatId,
    messageId: input.messageId,
    userAnswer: input.userAnswer,
    correctness: input.correctness,
    mistakeCategory: input.mistakeCategory,
    mistakeExplanation: input.mistakeExplanation,
    createdAt: new Date().toISOString(),
  }
  const next = [row, ...loadStudyAttempts()].slice(0, 500)
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(next))
  return row
}

export function loadReviewTopics(): ReviewTopic[] {
  return readJson(REVIEW_KEY, [])
}

export function addReviewTopic(topic: string, examSection?: ExamSection): ReviewTopic {
  const existing = loadReviewTopics()
  const hit = existing.find((t) => t.topic.toLowerCase() === topic.toLowerCase())
  if (hit) return hit
  const row: ReviewTopic = {
    id: uid('review'),
    topic,
    examSection,
    addedAt: new Date().toISOString(),
  }
  localStorage.setItem(REVIEW_KEY, JSON.stringify([row, ...existing]))
  return row
}

export function gradeUserAnswer(userAnswer: string, correctAnswer: string): {
  correctness: AttemptCorrectness
  mistakeCategory?: string
  mistakeExplanation: string
} {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[$,]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const u = normalize(userAnswer)
  const c = normalize(correctAnswer)
  if (!u) {
    return {
      correctness: 'incorrect',
      mistakeCategory: 'blank',
      mistakeExplanation: 'No answer was provided.',
    }
  }
  if (u === c || c.includes(u) || u.includes(c)) {
    return {
      correctness: 'correct',
      mistakeExplanation: 'Your answer matches the key points of the correct solution.',
    }
  }
  // Partial: shared significant tokens
  const uTokens = new Set(u.split(' ').filter((t) => t.length > 2))
  const cTokens = c.split(' ').filter((t) => t.length > 2)
  const overlap = cTokens.filter((t) => uTokens.has(t)).length
  if (overlap >= Math.max(1, Math.floor(cTokens.length / 3))) {
    return {
      correctness: 'partially_correct',
      mistakeCategory: 'incomplete',
      mistakeExplanation:
        'Your answer is partially correct but missing key elements of the full solution.',
    }
  }
  return {
    correctness: 'incorrect',
    mistakeCategory: 'concept_mismatch',
    mistakeExplanation: `Your answer does not match the correct solution (${correctAnswer}). Review the rule and facts that matter.`,
  }
}

export const MODE_SYSTEM_ADDENDA: Record<ResponseMode, string> = {
  professional: `Response mode: Professional.
Prioritize: concise conclusion, facts, applicable authority, technical analysis, calculation, journal entry, assumptions, missing information, risks, professional-review status.
Do not invent a confidence percentage — the server calculates evidence confidence deterministically.`,
  cpa_exam_study: `Response mode: CPA Exam Study — explain like a patient CPA tutor for a student.
Teach in depth: what the question tests, facts that matter, the governing rule, step-by-step reasoning, calculation with formula before numbers when needed, journal entry effects when relevant, why wrong approaches fail, common exam traps, and a short memory shortcut.
Always include clear citations to the authorities you used (publisher, title, section/page when known).
Never invent a confidence percentage, probability, or “chance the answer is correct.” Do not say “I am X% sure.”
Never imply this is an official AICPA exam question. Never reproduce copyrighted CPA-review or test-bank content.`,
  quick_answer: `Response mode: Quick Answer.
Give a direct answer, 1–2 sentence explanation, essential calculation if any, main source, and note that evidence confidence is calculated by the server.
Do not bypass validation or source requirements. Do not invent a confidence percentage.`,
}
