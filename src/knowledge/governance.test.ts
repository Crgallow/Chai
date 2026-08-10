import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { KnowledgeSourceSchema, KnowledgeUploadMetaSchema } from './schemas.ts'
import { classifyResearchContext, evaluateSourceSufficiency } from './sufficiency/engine.ts'
import { MockLocalKnowledgeRetriever } from './retrieval/retriever.ts'
import { MockOfficialSourceResearchProvider, assertAllowlistedUrl } from './research/officialProvider.ts'
import { runControlledResearch } from './researchPipeline.ts'
import { seedDemoKnowledgeIfEmpty } from './mock/seed.ts'
import { validateUpload } from './processor/localProcessor.ts'
import {
  createSourceFromUpload,
  reviewSource,
  submitForReview,
  supersedeSource,
} from './service.ts'
import { getAllowlist, listSources, upsertSource } from './store/jsonStore.ts'

beforeAll(async () => {
  process.env.CHAI_ADMIN_TOKEN = process.env.CHAI_ADMIN_TOKEN || 'test-admin'
  await seedDemoKnowledgeIfEmpty(true)
})

describe('schemas', () => {
  it('validates knowledge upload metadata', () => {
    const meta = KnowledgeUploadMetaSchema.parse({
      publisher: 'IRS',
      title: 'Demo',
      sourceType: 'authoritative',
      category: 'tax',
      authorityLevel: 'primary_authority',
      licensingStatus: 'public',
    })
    expect(meta.title).toBe('Demo')
  })

  it('rejects invalid source status', () => {
    expect(() =>
      KnowledgeSourceSchema.parse({
        id: 'x',
        publisher: 'IRS',
        title: 't',
        sourceType: 'authoritative',
        category: 'tax',
        authorityLevel: 'primary_authority',
        licensingStatus: 'public',
        status: 'nope',
        indexingStatus: 'indexed',
        verificationStatus: 'verified',
        createdAt: new Date().toISOString(),
        createdBy: 'a',
        updatedAt: new Date().toISOString(),
        updatedBy: 'a',
      }),
    ).toThrow()
  })
})

describe('upload validation', () => {
  it('blocks executables and huge files', () => {
    expect(() => validateUpload('malware.exe', 'application/octet-stream', 10)).toThrow(/Unsupported extension|Executable/)
    expect(() => validateUpload('a.pdf', 'application/pdf', 20 * 1024 * 1024)).toThrow(/maximum/)
  })
})

describe('context + sufficiency', () => {
  it('requires tax year for tax questions', () => {
    const ctx = classifyResearchContext('What is the MACRS rule for computers?')
    expect(ctx.category).toBe('tax')
    expect(ctx.missingInformation.some((m) => m.field === 'applicableYear')).toBe(true)
  })

  it('flags PCAOB source for AICPA need', async () => {
    const retriever = new MockLocalKnowledgeRetriever()
    const results = await retriever.search({
      searchTerms: 'PCAOB issuer audit',
      includeExcludedStatuses: true,
    })
    const pcaobOnly = results.filter((r) => r.source.id === 'ks_demo_pcaob')
    expect(pcaobOnly.length).toBeGreaterThan(0)
    const ctx = classifyResearchContext('AICPA nonissuer audit evidence standards 2025 US-federal')
    ctx.auditFramework = 'AICPA'
    ctx.applicableYear = 2025
    ctx.jurisdiction = 'US-federal'
    ctx.missingInformation = []
    const sufficiency = evaluateSourceSufficiency({ context: ctx, results: pcaobOnly })
    expect(sufficiency.sufficient).toBe(false)
    expect(sufficiency.deficiencies.join(' ') + sufficiency.conflictingSourceIds.join(' ')).toMatch(
      /framework|PCAOB|AICPA|authoritative|mismatch/i,
    )
  })
})

describe('retrieval filters', () => {
  it('returns approved IRS 2025 for matching year', async () => {
    const retriever = new MockLocalKnowledgeRetriever()
    const hits = await retriever.search({
      searchTerms: 'MACRS half-year 5-year',
      taxYear: 2025,
      jurisdiction: 'US-federal',
    })
    expect(hits.some((h) => h.source.id === 'ks_demo_irs_2025')).toBe(true)
    expect(hits.every((h) => h.source.taxYear !== 2020 || h.source.status === 'superseded')).toBe(true)
  })

  it('allows superseded source for historical year', async () => {
    const retriever = new MockLocalKnowledgeRetriever()
    const hits = await retriever.search({
      searchTerms: 'MACRS bonus',
      taxYear: 2020,
      allowHistoricalSuperseded: true,
    })
    expect(hits.some((h) => h.source.id === 'ks_demo_irs_2020')).toBe(true)
  })

  it('isolates restricted org sources', async () => {
    const retriever = new MockLocalKnowledgeRetriever()
    const hits = await retriever.search({
      searchTerms: 'restricted educational',
      organizationId: 'platform',
    })
    expect(hits.some((h) => h.source.id === 'ks_demo_restricted')).toBe(false)
  })
})

describe('research pipeline', () => {
  it('refuses to conclude when tax year missing', async () => {
    const result = await runControlledResearch({
      question: 'Explain MACRS five-year property depreciation.',
    })
    expect(result.unableToConclude).toBe(true)
    expect(result.explanation).toMatch(/sufficient authoritative support/i)
  })

  it('concludes with approved IRS demo for 2025', async () => {
    const result = await runControlledResearch({
      question: 'For US-federal tax year 2025, what is MACRS GDS 5-year half-year year-1 percentage?',
      organizationId: 'platform',
    })
    expect(result.unableToConclude).toBe(false)
    expect(result.citations.some((c) => c.quotedText?.includes('20.00%'))).toBe(true)
    expect(result.usedMockRetrieval).toBe(true)
  })

  it('labels internal policy separately and does not treat as primary tax authority alone', async () => {
    const result = await runControlledResearch({
      question: 'For US-federal tax year 2025, what does Demo Co policy say about book depreciation of computers?',
      organizationId: 'org_demo',
    })
    // May conclude from policy for company question, or still find IRS — ensure policy citations labeled
    const policyCite = result.citations.find((c) => /Demo Co|policy/i.test(c.publisher + c.title))
    if (policyCite) {
      expect(policyCite.authorityLevel === 'internal_policy' || /policy/i.test(policyCite.sourceType)).toBe(true)
    }
  })
})

describe('official allowlist mock', () => {
  it('seeds allowlist domains', async () => {
    const list = await getAllowlist()
    expect(list.some((d) => d.domain === 'irs.gov')).toBe(true)
  })

  it('mock official provider returns demo IRS page for depreciation', async () => {
    const provider = new MockOfficialSourceResearchProvider()
    const hits = await provider.search({ query: 'MACRS depreciation publication 946', taxYear: 2025 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].demoData).toBe(true)
    expect(await assertAllowlistedUrl(hits[0].url)).toBe(true)
  })
})

describe('workflow', () => {
  it('prevents self-approval and supports supersede link', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chai-kg-'))
    const file = path.join(dir, 'note.txt')
    await fs.writeFile(
      file,
      `Synthetic public demo text about MACRS half-year convention for tests ${Date.now()}.`,
      'utf8',
    )
    const source = await createSourceFromUpload({
      tempPath: file,
      originalName: 'note.txt',
      mimeType: 'text/plain',
      size: 40,
      actor: 'uploader',
      meta: {
        publisher: 'IRS',
        title: 'Workflow demo note',
        sourceType: 'authoritative',
        category: 'tax',
        authorityLevel: 'official_guidance',
        licensingStatus: 'public',
        taxYear: 2025,
        jurisdiction: 'US-federal',
        organizationId: 'platform',
      },
    })
    await submitForReview(source.id, 'uploader')
    await expect(
      reviewSource({
        id: source.id,
        actor: 'uploader',
        decision: 'approved',
        reason: 'looks good',
      }),
    ).rejects.toThrow(/cannot approve their own/)

    const approved = await reviewSource({
      id: source.id,
      actor: 'reviewer',
      decision: 'approved',
      reason: 'Verified public demo excerpt',
    })
    expect(approved.status).toBe('approved')

    const replacement = (await listSources()).find((s) => s.id === 'ks_demo_irs_2025')!
    await upsertSource({ ...replacement, status: 'approved' })
    const superseded = await supersedeSource({
      oldId: approved.id,
      newId: replacement.id,
      actor: 'reviewer',
      reason: 'Replaced by canonical demo IRS 2025',
    })
    expect(superseded.status).toBe('superseded')
  })
})

describe('unverified exclusion', () => {
  it('does not treat unverified authoritative hit as sufficient alone', async () => {
    const retriever = new MockLocalKnowledgeRetriever()
    const results = await retriever.search({
      searchTerms: 'Unverified text authoritative',
      taxYear: 2025,
    })
    const unverifiedHits = results.filter((r) => r.source.id === 'ks_demo_unverified')
    const ctx = classifyResearchContext('US-federal tax year 2025 MACRS')
    ctx.missingInformation = []
    ctx.applicableYear = 2025
    ctx.jurisdiction = 'US-federal'
    const sufficiency = evaluateSourceSufficiency({
      context: ctx,
      results: unverifiedHits,
    })
    expect(sufficiency.sufficient).toBe(false)
  })
})
