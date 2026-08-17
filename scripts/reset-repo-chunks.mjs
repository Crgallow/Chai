import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSources, saveSources, KG_CHUNKS, KG_CHUNKS_DIR } from '../src/knowledge/store/jsonStore.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  // Drop monolithic chunks.json — it hit JS string size limits (~512MB).
  await fs.unlink(KG_CHUNKS).catch(() => undefined)
  await fs.rm(KG_CHUNKS_DIR, { recursive: true, force: true }).catch(() => undefined)
  await fs.mkdir(KG_CHUNKS_DIR, { recursive: true })

  const sources = await listSources()
  const next = sources.map((s) => {
    if (!s.id.startsWith('ks_repo_')) return s
    return {
      ...s,
      indexingStatus: 'pending',
      indexingError: undefined,
      checksum: `reset-${Date.now()}`,
    }
  })
  await saveSources(next)
  console.log(
    `Reset ${next.filter((s) => s.id.startsWith('ks_repo_')).length} repo sources; cleared chunk store`,
  )
}

await main()
