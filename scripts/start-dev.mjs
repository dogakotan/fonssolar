import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const children = new Set()

async function pdfServiceIsRunning() {
  try {
    const response = await fetch('http://127.0.0.1:8002/health', {
      signal: AbortSignal.timeout(1500),
    })
    return response.ok
  } catch {
    return false
  }
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.once('SIGINT', () => {
  stopChildren()
  process.exit(0)
})
process.once('SIGTERM', () => {
  stopChildren()
  process.exit(0)
})
process.once('exit', stopChildren)

if (!(await pdfServiceIsRunning())) {
  const pythonCommand = process.platform === 'win32' ? 'python.exe' : 'python3'
  const pdfService = start(
    pythonCommand,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8002'],
    { cwd: path.join(rootDir, 'pdf-service') },
  )
  pdfService.once('exit', code => {
    if (code) {
      console.error(`Python PDF servisi başlatılamadı (çıkış kodu: ${code}).`)
    }
  })
}

const vite = start(process.execPath, [viteEntry])
vite.once('exit', code => {
  stopChildren()
  process.exit(code ?? 0)
})
