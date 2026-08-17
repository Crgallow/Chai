import { useMemo, useState, type ReactNode } from 'react'
import type { CPAStudyResponse } from '../types'
import {
  addReviewTopic,
  gradeUserAnswer,
  recordStudyAttempt,
  saveStudyQuestion,
} from '../study/persistence'
import { SourcesAndConfidence } from './SourcesAndConfidence'
import type { StructuredAnswer } from '../types'

interface CPAStudyCardProps {
  study: CPAStudyResponse
  structured: StructuredAnswer
  chatId?: string
  messageId?: string
  prompt?: string
}

export function CPAStudyCard({ study, structured, chatId, messageId, prompt }: CPAStudyCardProps) {
  const preferHide =
    study.studyPreferenceApplied === 'answer_first' ||
    study.studyPreferenceApplied === 'hint_first'
  const [answerVisible, setAnswerVisible] = useState(!preferHide)
  const [hintIndex, setHintIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(
    study.studyPreferenceApplied === 'fastest_exam_method' ? study.steps.length : 1,
  )
  const [attempt, setAttempt] = useState('')
  const [attemptResult, setAttemptResult] = useState<string | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [showSimilar, setShowSimilar] = useState(false)

  const hints = useMemo(() => {
    const list: string[] = []
    if (study.relevantFacts[0]) list.push(`Focus on this fact: ${study.relevantFacts[0]}`)
    if (study.ruleToRemember) list.push(`Rule hint: ${study.ruleToRemember.slice(0, 120)}…`)
    if (study.commonExamTrap) list.push(`Watch for this trap: ${study.commonExamTrap}`)
    if (study.memoryShortcut) list.push(`Memory aid: ${study.memoryShortcut}`)
    return list.length ? list : ['Re-read the facts that matter and identify the rule being tested.']
  }, [study])

  const section = (title: string, body: ReactNode, show: boolean) =>
    show ? (
      <section key={title}>
        <h3>{title}</h3>
        {body}
      </section>
    ) : null

  return (
    <div className="structured-answer cpa-study">
      {study.mockLabeled && (
        <p className="online-banner">
          Mock CPA study response — original teaching content only. Not an official AICPA exam question.
        </p>
      )}
      {(study.examSection || study.topic) && (
        <p className="field-hint">
          {study.examSection ? `${study.examSection} · ` : ''}
          {study.topic}
          {study.subtopic ? ` · ${study.subtopic}` : ''}
          {study.difficulty ? ` · ${study.difficulty}` : ''}
        </p>
      )}

      <div className="study-toolbar">
        <button type="button" className="text-btn" onClick={() => setAnswerVisible((v) => !v)}>
          {answerVisible ? 'Hide final answer' : 'Reveal final answer'}
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => setHintIndex((i) => Math.min(i + 1, hints.length))}
          disabled={hintIndex >= hints.length}
        >
          Show one hint ({hintIndex}/{hints.length})
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => setStepIndex((i) => Math.min(i + 1, study.steps.length))}
          disabled={stepIndex >= study.steps.length}
        >
          Reveal next step ({stepIndex}/{study.steps.length})
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setUnderstood(true)
            if (prompt) {
              const saved = saveStudyQuestion({
                prompt,
                topic: study.topic,
                examSection: study.examSection,
                chatId,
                messageId,
              })
              // mark understood via local flag; also persist on saved row if exists
              void saved
            }
          }}
        >
          Mark understood
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            if (!prompt) return
            saveStudyQuestion({
              prompt,
              topic: study.topic,
              examSection: study.examSection,
              chatId,
              messageId,
            })
            setSavedNote('Saved for later review.')
          }}
        >
          Save for review
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            addReviewTopic(study.topic, study.examSection)
            setSavedNote(`Added “${study.topic}” to your review list.`)
          }}
        >
          Add topic to review list
        </button>
        {study.similarPracticeQuestion && (
          <button type="button" className="text-btn" onClick={() => setShowSimilar((v) => !v)}>
            {showSimilar ? 'Hide' : 'Generate'} similar question
          </button>
        )}
      </div>
      {understood && <p className="field-hint">Marked as understood.</p>}
      {savedNote && <p className="field-hint">{savedNote}</p>}
      {hintIndex > 0 && (
        <section>
          <h3>Hints</h3>
          <ol>
            {hints.slice(0, hintIndex).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </section>
      )}

      {preferHide && study.correctAnswer && (
        <section>
          <h3>Try it first</h3>
          <textarea
            className="study-attempt"
            rows={2}
            placeholder="Enter your answer before revealing…"
            value={attempt}
            onChange={(e) => setAttempt(e.target.value)}
          />
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              if (!study.correctAnswer) return
              const graded = gradeUserAnswer(attempt, study.correctAnswer)
              recordStudyAttempt({
                questionId: `${study.topic}:${study.correctAnswer}`,
                chatId,
                messageId,
                userAnswer: attempt,
                correctness: graded.correctness,
                mistakeCategory: graded.mistakeCategory,
                mistakeExplanation: graded.mistakeExplanation,
              })
              setAttemptResult(
                `${graded.correctness.replace('_', ' ')} — ${graded.mistakeExplanation}`,
              )
              setAnswerVisible(true)
            }}
          >
            Submit attempt
          </button>
          {attemptResult && <p className="field-hint">{attemptResult}</p>}
        </section>
      )}

      {section(
        'Correct Answer',
        <p>{answerVisible ? study.correctAnswer : '•••••••• (hidden)'}</p>,
        Boolean(study.correctAnswer),
      )}
      {section('What the Question Is Testing', <p>{study.conceptTested}</p>, Boolean(study.conceptTested))}
      {section(
        'Facts That Matter',
        <ul>
          {study.relevantFacts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>,
        study.relevantFacts.length > 0,
      )}
      {study.distractorFacts.length > 0 &&
        section(
          'Distractors',
          <ul>
            {study.distractorFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>,
          true,
        )}
      {section('Rule to Remember', <p>{study.ruleToRemember}</p>, Boolean(study.ruleToRemember))}
      {section(
        'Step-by-Step Solution',
        <ol>
          {study.steps.slice(0, stepIndex).map((s) => (
            <li key={s.id}>
              <strong>{s.title}.</strong> {s.detail}
              {s.formula ? <div className="field-hint">Formula: {s.formula}</div> : null}
            </li>
          ))}
        </ol>,
        study.steps.length > 0,
      )}
      {study.calculation &&
        section(
          'Calculation',
          <>
            <p className="field-hint">Formula: {study.calculation.formula}</p>
            <ol>
              {study.calculation.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>
              <strong>{study.calculation.result}</strong>
              {study.calculation.passedValidation ? ' · validation passed' : ' · validation failed'}
            </p>
          </>,
          true,
        )}
      {study.journalEntries &&
        study.journalEntries.length > 0 &&
        section(
          'Journal Entry',
          study.journalEntries.map((j) => (
            <div key={j.memo}>
              <p>{j.memo}</p>
              <ul>
                {j.lines.map((l, i) => (
                  <li key={`${l.account}-${i}`}>
                    {l.account}: Dr {l.debit || '—'} / Cr {l.credit || '—'}
                  </li>
                ))}
              </ul>
              {j.debitCreditExplanation && <p className="field-hint">{j.debitCreditExplanation}</p>}
              <p className="field-hint">{j.balanced ? 'Balanced' : 'Out of balance'}</p>
            </div>
          )),
          true,
        )}
      {study.incorrectChoiceExplanations &&
        study.incorrectChoiceExplanations.length > 0 &&
        section(
          'Why the Other Choices Are Wrong',
          <ul>
            {study.incorrectChoiceExplanations.map((c) => (
              <li key={c.choice}>
                <strong>{c.choice}:</strong> {c.whyWrong}
              </li>
            ))}
          </ul>,
          true,
        )}
      {section('Common CPA Exam Trap', <p>{study.commonExamTrap}</p>, Boolean(study.commonExamTrap))}
      {section('Memory Shortcut', <p>{study.memoryShortcut}</p>, Boolean(study.memoryShortcut))}
      {study.bookVsTaxNote && section('Book vs tax', <p>{study.bookVsTaxNote}</p>, true)}
      {study.applicableTaxYear != null &&
        section('Applicable tax year', <p>{study.applicableTaxYear}</p>, true)}
      {showSimilar &&
        study.similarPracticeQuestion &&
        section(
          'Similar Practice Question',
          <>
            <p>{study.similarPracticeQuestion.prompt}</p>
            {study.similarPracticeQuestion.choices && (
              <ul>
                {study.similarPracticeQuestion.choices.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <p className="field-hint">{study.similarPracticeQuestion.disclaimer}</p>
            <details>
              <summary>Show solution</summary>
              <p>{study.similarPracticeQuestion.correctAnswer}</p>
            </details>
          </>,
          true,
        )}
      {study.assumptions.length > 0 &&
        section(
          'Assumptions',
          <ul>
            {study.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>,
          true,
        )}
      {study.missingInformation.length > 0 &&
        section(
          'Missing information',
          <ul>
            {study.missingInformation.map((m) => (
              <li key={m.field}>
                {m.field}: {m.reason}
              </li>
            ))}
          </ul>,
          true,
        )}

      <SourcesAndConfidence structured={structured} />
    </div>
  )
}
