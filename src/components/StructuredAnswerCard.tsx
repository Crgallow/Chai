import type { StructuredAnswer } from '../types'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

interface StructuredAnswerCardProps {
  structured: StructuredAnswer
}

export function StructuredAnswerCard({ structured }: StructuredAnswerCardProps) {
  const hasBody =
    (structured.missingFacts?.length ?? 0) > 0 ||
    (structured.assumptions?.length ?? 0) > 0 ||
    (structured.schedules?.length ?? 0) > 0 ||
    (structured.journalEntries?.length ?? 0) > 0 ||
    (structured.documentQuotes?.length ?? 0) > 0 ||
    Boolean(structured.research) ||
    structured.reconciliation ||
    (structured.citations?.length ?? 0) > 0 ||
    (structured.toolTrace?.length ?? 0) > 0

  if (!hasBody) return null

  return (
    <div className="structured-answer">
      {structured.missingFacts && structured.missingFacts.length > 0 && (
        <section>
          <h3>Missing facts</h3>
          <ul>
            {structured.missingFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {structured.research && (
        <section className="sources-authority">
          <h3>Sources and Authority</h3>
          {structured.research.usedOfficialResearch && (
            <p className="online-banner">
              Searched approved official websites — these results are not from your permanent knowledge base
              {structured.research.usedMockRetrieval ? ' (mock/demo provider)' : ''}.
            </p>
          )}
          {structured.research.usedMockRetrieval && (
            <p className="field-hint">
              <span className="gov-badge">Mock retrieval</span> Internal search is deterministic/local, not live
              embeddings.
            </p>
          )}
          {structured.research.unableToConclude ? (
            <p>
              {structured.research.explanation ||
                'I found potentially relevant guidance, but I could not locate sufficient authoritative support for a reliable conclusion. Additional research or professional review is required.'}
            </p>
          ) : (
            <>
              {structured.research.conclusion && <p><strong>Conclusion:</strong> {structured.research.conclusion}</p>}
              {structured.research.explanation && <p>{structured.research.explanation}</p>}
            </>
          )}
          <ul className="validation-list">
            <li>
              Context: {structured.research.context.category}
              {structured.research.context.applicableYear
                ? ` · year ${structured.research.context.applicableYear}`
                : ''}
              {structured.research.context.jurisdiction
                ? ` · ${structured.research.context.jurisdiction}`
                : ''}
              {structured.research.context.accountingFramework
                ? ` · ${structured.research.context.accountingFramework}`
                : ''}
            </li>
            <li>
              Confidence: {structured.research.confidence.level} — {structured.research.confidence.reason}
            </li>
            <li>
              Sufficiency score {structured.research.sourceSufficiency.score.toFixed(2)} (not a correctness
              guarantee)
              {structured.research.requiresProfessionalReview ? ' · Professional review recommended' : ''}
            </li>
          </ul>
          {structured.research.factsReliedUpon.length > 0 && (
            <>
              <h4>Facts relied upon</h4>
              <ul>
                {structured.research.factsReliedUpon.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          {structured.research.missingInformation.length > 0 && (
            <>
              <h4>Missing information</h4>
              <ul>
                {structured.research.missingInformation.map((m) => (
                  <li key={m.field}>
                    {m.field}: {m.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {structured.research.citations.length > 0 && (
            <>
              <h4>Citations</h4>
              <div className="citation-list">
                {structured.research.citations.map((c, i) => (
                  <article key={`${c.title}-${i}`} className="citation-chip">
                    <header>
                      <code>{c.internalOrExternal}</code>
                      <span>
                        {c.authorityLevel}
                        {c.demoData ? ' · DEMO' : ''}
                        {c.verified ? ' · verified' : ''}
                      </span>
                    </header>
                    <strong>
                      {c.publisher}: {c.title}
                    </strong>
                    {c.quotedText && <blockquote className="doc-quote">“{c.quotedText}”</blockquote>}
                    {c.page != null && (
                      <p className="field-hint">
                        Location: page {c.page}
                        {c.section ? ` · ${c.section}` : ''}
                      </p>
                    )}
                    {c.sourceUrl && (
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {structured.research.warnings.length > 0 && (
            <>
              <h4>Warnings</h4>
              <ul className="validation-list">
                {structured.research.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {structured.webSearchUsed && !structured.research?.usedOfficialResearch && (
        <p className="online-banner">Searched online — results are labeled separately from uploaded documents.</p>
      )}

      {structured.documentQuotes && structured.documentQuotes.length > 0 && (
        <section>
          <h3>Quotes from your files</h3>
          <div className="citation-list">
            {structured.documentQuotes.map((q, i) => (
              <article key={`${q.filename}-${q.chunkIndex}-${i}`} className="citation-chip">
                <header>
                  <code>{q.filename}</code>
                  <span>match {(q.score * 100).toFixed(0)}%</span>
                </header>
                <blockquote className="doc-quote">“{q.quote.trim()}”</blockquote>
              </article>
            ))}
          </div>
        </section>
      )}

      {structured.journalEntries?.map((entry, idx) => (
        <section key={`${entry.memo}-${idx}`}>
          <h3>
            Journal entry{' '}
            <span className={`kind-pill ${entry.balanced ? 'kind-tax' : 'kind-book'}`}>
              {entry.balanced ? 'balanced' : 'out of balance'}
            </span>
          </h3>
          <p className="schedule-summary">
            {entry.date ? `${entry.date} · ` : ''}
            {entry.memo}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line, i) => (
                  <tr key={`${line.account}-${i}`}>
                    <td>
                      {line.account}
                      {line.memo ? <div className="line-memo">{line.memo}</div> : null}
                    </td>
                    <td>{line.debit ? money(line.debit) : ''}</td>
                    <td>{line.credit ? money(line.credit) : ''}</td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td>Totals</td>
                  <td>{money(entry.totalDebits)}</td>
                  <td>{money(entry.totalCredits)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {entry.validations.length > 0 && (
            <ul className="validation-list">
              {entry.validations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {structured.assumptions && structured.assumptions.length > 0 && (
        <section>
          <h3>Assumptions</h3>
          <ul>
            {structured.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {structured.schedules?.map((schedule) => (
        <section key={`${schedule.kind}-${schedule.label}`}>
          <h3>
            {schedule.label}{' '}
            <span className={`kind-pill kind-${schedule.kind}`}>{schedule.kind}</span>
          </h3>
          <p className="schedule-summary">
            Current-year expense <strong>{money(schedule.currentYearExpense)}</strong>
            {' · '}
            Remaining basis <strong>{money(schedule.remainingBasis)}</strong>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Yr</th>
                  <th>Tax year</th>
                  <th>Rate %</th>
                  <th>Expense</th>
                  <th>Accum.</th>
                  <th>End basis</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row) => (
                  <tr key={`${schedule.kind}-${row.yearIndex}`}>
                    <td>{row.yearIndex}</td>
                    <td>{row.taxYear ?? '—'}</td>
                    <td>{row.ratePercent != null ? row.ratePercent.toFixed(3) : '—'}</td>
                    <td>{money(row.expense)}</td>
                    <td>{money(row.accumulated)}</td>
                    <td>{money(row.endingBasis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schedule.validations.length > 0 && (
            <ul className="validation-list">
              {schedule.validations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {structured.reconciliation && (
        <section>
          <h3>Book vs tax reconciliation</h3>
          <div className="recon-grid">
            <div>
              <span>Book</span>
              <strong>{money(structured.reconciliation.bookExpense)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{money(structured.reconciliation.taxExpense)}</strong>
            </div>
            <div>
              <span>Temp. difference</span>
              <strong>{money(structured.reconciliation.temporaryDifference)}</strong>
            </div>
          </div>
          <p className="recon-hint">{structured.reconciliation.hint}</p>
        </section>
      )}

      {structured.citations && structured.citations.length > 0 && (
        <section>
          <h3>Citations</h3>
          <div className="citation-list">
            {structured.citations.map((c) => (
              <article key={c.id} className="citation-chip">
                <header>
                  <code>{c.id}</code>
                  <span>{c.source}</span>
                </header>
                <strong>{c.title}</strong>
                <p>{c.excerpt}</p>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {structured.toolTrace && structured.toolTrace.length > 0 && (
        <details className="tool-trace">
          <summary>Tool trace ({structured.toolTrace.length})</summary>
          <ol>
            {structured.toolTrace.map((t) => (
              <li key={t}>
                <code>{t}</code>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
