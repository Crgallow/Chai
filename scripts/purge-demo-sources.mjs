import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deleteSourceRecord,
  listSources,
  KG_ROOT,
} from '../src/knowledge/store/jsonStore.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const sources = await listSources()
  const demos = sources.filter((s) => s.id.startsWith('ks_demo_'))
  for (const s of demos) {
    await deleteSourceRecord(s.id)
    console.log('Removed', s.id)
  }

  // Drop any leftover demo files under KG files/
  const filesDir = path.join(KG_ROOT, 'files')
  try {
    const names = await fs.readdir(filesDir)
    for (const name of names) {
      if (name.includes('ks_demo_') || /demo/i.test(name)) {
        await fs.unlink(path.join(filesDir, name)).catch(() => undefined)
        console.log('Deleted file', name)
      }
    }
  } catch {
    /* empty */
  }

  console.log(`Purged ${demos.length} demo sources`)
}

await main()
