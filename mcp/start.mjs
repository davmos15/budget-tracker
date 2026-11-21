// Cross-platform launcher: installs the server's dependencies on first run,
// then starts it. npm output goes to stderr so it can't corrupt the MCP stream.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
if (!existsSync(join(here, 'node_modules'))) {
  const r = spawnSync('npm', ['ci', '--silent', '--no-audit', '--no-fund'], {
    cwd: here,
    stdio: ['ignore', process.stderr, process.stderr],
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) {
    console.error('Could not install the MCP server dependencies (npm ci failed).')
    process.exit(1)
  }
}
await import(pathToFileURL(join(here, 'server.js')).href)
