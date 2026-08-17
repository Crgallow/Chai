import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ResearchRunSchema, type ResearchRun } from '../../src/research/schemas.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../data/research-runs')
const INDEX = path.join(ROOT, 'index.json')

async function ensure(): Promise<void> {
  await fs.mkdir(ROOT, { recursive: true })
}

export async function saveResearchRun(run: ResearchRun): Promise<void> {
  await ensure()
  const parsed = ResearchRunSchema.parse(run)
  const file = path.join(ROOT, `${parsed.id}.json`)
  await fs.writeFile(file, JSON.stringify(parsed, null, 2), 'utf8')
  let index: string[] = []
  try {
    index = JSON.parse(await fs.readFile(INDEX, 'utf8')) as string[]
  } catch {
    index = []
  }
  if (!index.includes(parsed.id)) {
    index.unshift(parsed.id)
    await fs.writeFile(INDEX, JSON.stringify(index.slice(0, 500), null, 2), 'utf8')
  }
}

export async function loadResearchRun(id: string): Promise<ResearchRun | null> {
  try {
    const raw = await fs.readFile(path.join(ROOT, `${id}.json`), 'utf8')
    return ResearchRunSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}
