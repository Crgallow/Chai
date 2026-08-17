import { syncAuthoritativeSourcesFromRepo } from '../server/syncAuthoritativeSources.ts'

const r = await syncAuthoritativeSourcesFromRepo()
console.log(JSON.stringify(r, null, 2))
if (r.errors.length) process.exitCode = 1
