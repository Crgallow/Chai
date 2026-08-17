import type { KnowledgeSource } from '../schemas.ts'
import { KG_FILES, listSources, replaceChunksForSource, saveSources, uid } from '../store/jsonStore.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

function base(partial: Partial<KnowledgeSource> & Pick<KnowledgeSource, 'id' | 'title' | 'publisher'>): KnowledgeSource {
  const now = new Date().toISOString()
  return {
    organizationId: 'platform',
    description: 'Synthetic public demonstration file for Chai Knowledge Governance tests.',
    sourceType: 'authoritative',
    category: 'tax',
    authorityLevel: 'official_guidance',
    licensingStatus: 'public',
    status: 'approved',
    indexingStatus: 'indexed',
    verificationStatus: 'verified',
    version: 1,
    createdAt: now,
    createdBy: 'seed',
    updatedAt: now,
    updatedBy: 'seed',
    ...partial,
  }
}

/** Seeds demo sources for the 15 deterministic scenarios (public/synthetic only). */
export async function seedDemoKnowledgeIfEmpty(force = false): Promise<KnowledgeSource[]> {
  const existingPath = path.join(path.dirname(KG_FILES), 'sources.json')
  try {
    if (!force) {
      const raw = await fs.readFile(existingPath, 'utf8')
      const arr = JSON.parse(raw) as unknown[]
      if (arr.length > 0) return arr as KnowledgeSource[]
    }
  } catch {
    /* empty */
  }

  await fs.mkdir(KG_FILES, { recursive: true })

  const irs2025 = base({
    id: 'ks_demo_irs_2025',
    publisher: 'IRS',
    title: 'Demo IRS Pub 946 excerpt — 2025 MACRS half-year',
    taxYear: 2025,
    jurisdiction: 'US-federal',
    accountingFramework: 'TAX',
    topic: 'depreciation',
    category: 'tax',
    sourceType: 'authoritative',
    authorityLevel: 'primary_authority',
    effectiveDate: '2025-01-01',
    lastVerifiedAt: new Date().toISOString(),
    lastVerifiedBy: 'seed',
  })

  const irs2020 = base({
    id: 'ks_demo_irs_2020',
    publisher: 'IRS',
    title: 'Demo IRS Pub 946 excerpt — 2020 (outdated for 2025 questions)',
    taxYear: 2020,
    jurisdiction: 'US-federal',
    accountingFramework: 'TAX',
    topic: 'depreciation',
    status: 'superseded',
    supersededDate: '2025-01-01',
    effectiveDate: '2020-01-01',
  })

  const pcaob = base({
    id: 'ks_demo_pcaob',
    publisher: 'PCAOB',
    title: 'Demo PCAOB audit standard note',
    category: 'audit',
    sourceType: 'authoritative',
    authorityLevel: 'professional_standard',
    auditFramework: 'PCAOB',
    topic: 'audit evidence',
  })

  const policy = base({
    id: 'ks_demo_policy',
    publisher: 'Demo Co',
    title: 'Demo company half-year book depreciation policy',
    category: 'company_policy',
    sourceType: 'organization_policy',
    authorityLevel: 'internal_policy',
    accountingFramework: 'US_GAAP',
    topic: 'depreciation',
    organizationId: 'org_demo',
  })

  const conflictA = base({
    id: 'ks_demo_conflict_a',
    publisher: 'AICPA',
    title: 'Demo AICPA nonissuer audit note',
    category: 'audit',
    auditFramework: 'AICPA',
    authorityLevel: 'professional_standard',
  })

  const unverified = base({
    id: 'ks_demo_unverified',
    publisher: 'IRS',
    title: 'Demo unverified authoritative upload',
    taxYear: 2025,
    jurisdiction: 'US-federal',
    verificationStatus: 'unverified',
    status: 'approved',
  })

  const restricted = base({
    id: 'ks_demo_restricted',
    publisher: 'Demo Licensee',
    title: 'Demo restricted educational excerpt',
    sourceType: 'educational',
    authorityLevel: 'secondary_analysis',
    licensingStatus: 'restricted',
    status: 'approved',
    organizationId: 'org_other',
  })

  const failed = base({
    id: 'ks_demo_failed_index',
    publisher: 'IRS',
    title: 'Demo failed indexing source',
    indexingStatus: 'failed',
    indexingError: 'Synthetic failure for retry demo',
    status: 'draft',
  })

  const demoSources = [irs2025, irs2020, pcaob, policy, conflictA, unverified, restricted, failed]
  const existing = await listSources().catch(() => [] as KnowledgeSource[])
  const kept = existing.filter((s) => !s.id.startsWith('ks_demo_'))
  const sources = [...kept, ...demoSources]
  await saveSources(sources)

  const texts: Record<string, string> = {
    ks_demo_irs_2025:
      'For 2025, MACRS GDS 5-year property generally uses the half-year convention. Year-1 depreciation percentage for 5-year property under half-year is 20.00% of unadjusted basis.',
    ks_demo_irs_2020:
      'For 2020, this demo excerpt describes older bonus depreciation percentages that are not authoritative for 2025 conclusions.',
    ks_demo_pcaob:
      'PCAOB standards apply to audits of issuers. Do not apply PCAOB requirements to an AICPA nonissuer audit engagement.',
    ks_demo_policy:
      'Company policy: computers use straight-line book depreciation over 5 years with half-year convention and zero salvage unless Finance approves otherwise.',
    ks_demo_conflict_a:
      'AICPA standards apply to nonissuer audits. PCAOB standards are not the governing framework for this engagement type.',
    ks_demo_unverified:
      'Unverified text that should not drive a final authoritative conclusion until verification completes.',
    ks_demo_restricted: 'Restricted educational content — access controlled by organization.',
    ks_demo_failed_index: '',
  }

  // Replace only demo chunks — never wipe uploaded authoritative chunk files.
  for (const [sourceId, text] of Object.entries(texts)) {
    if (!text) {
      await replaceChunksForSource(sourceId, [])
      continue
    }
    const meta = demoSources.find((s) => s.id === sourceId)
    await replaceChunksForSource(sourceId, [
      {
        id: uid('chunk'),
        sourceId,
        chunkIndex: 0,
        text,
        page: 1,
        section: 'demo',
        paragraph: 'p1',
        headingHierarchy: ['Demo'],
        applicableYear: meta?.taxYear,
        jurisdiction: meta?.jurisdiction,
        authorityLevel: meta?.authorityLevel,
        documentStatus: meta?.status,
        startOffset: 0,
        endOffset: text.length,
      },
    ])
  }

  // write tiny demo files for preview
  for (const s of demoSources) {
    if (!texts[s.id]) continue
    const name = `${s.id}__demo.txt`
    s.storagePath = name
    s.originalFileName = `${s.id}.txt`
    s.mimeType = 'text/plain'
    await fs.writeFile(path.join(KG_FILES, name), texts[s.id], 'utf8')
  }
  const finalSources = [...kept, ...demoSources]
  await saveSources(finalSources)
  return finalSources
}

export const MOCK_SCENARIO_NAMES = [
  'approved_irs_year_match',
  'outdated_irs_rejected_for_new_year',
  'pcaob_wrong_for_aicpa',
  'internal_policy_labeled',
  'conflicting_sources_review',
  'no_internal_triggers_official',
  'official_research_adequate',
  'official_research_inadequate',
  'superseded_historical_year',
  'restricted_org_isolation',
  'missing_tax_year',
  'unverified_excluded',
  'duplicate_checksum',
  'failed_indexing_retry',
  'external_promotion_queue',
] as const
