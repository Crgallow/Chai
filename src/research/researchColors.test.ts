import { describe, expect, it } from 'vitest'
import {
  classifyFramework,
  classifySourceAccent,
  confidenceTone,
  parseResearchAnswerSections,
} from './researchColors.ts'

describe('researchColors', () => {
  it('classifies AICPA vs PCAOB frameworks', () => {
    expect(classifyFramework('AICPA U.S. GAAS AU-C 501')).toBe('aicpa')
    expect(classifyFramework('PCAOB AS 2510 inventory')).toBe('pcaob')
  })

  it('classifies source accents with text-distinguishable categories', () => {
    expect(
      classifySourceAccent({
        publisher: 'AICPA',
        title: 'AU-C Sections',
        section: 'AU-C 501',
        verificationStatus: 'verified',
        internalOrExternal: 'internal',
      }),
    ).toBe('aicpa')
    expect(
      classifySourceAccent({
        publisher: 'PCAOB',
        title: 'AS 2510 — Auditing Inventories',
        verificationStatus: 'verified',
        internalOrExternal: 'internal',
      }),
    ).toBe('pcaob')
  })

  it('maps confidence labels to tones', () => {
    expect(confidenceTone('very_high', 95)).toBe('verified')
    expect(confidenceTone('moderate', 65)).toBe('warning')
    expect(confidenceTone('very_low', 20)).toBe('error')
    expect(confidenceTone(undefined, undefined)).toBe('neutral')
  })

  it('parses ## sections from audit answers', () => {
    const sections = parseResearchAnswerSections(
      '## Direct conclusion\nPrimary is AICPA.\n\n## Separate PCAOB comparison\nIf public…',
    )
    expect(sections?.length).toBe(2)
    expect(sections?.[0].title).toBe('Direct conclusion')
    expect(sections?.[1].accent).toBe('pcaob')
  })
})
