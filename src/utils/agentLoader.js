// Tüm .claude/agents/*.md dosyalarını build zamanında yükler ve parse eder.
// AGENT_PROMPTS[id] → o ajanın tam sistem promptu (---...--- sonrası body)
const rawFiles = import.meta.glob('../../.claude/agents/*.md', { as: 'raw', eager: true })

function parseMd(raw) {
  const lines = raw.split('\n')
  if (lines[0].trim() !== '---') return raw.trim()

  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break }
  }
  if (endIdx === -1) return raw.trim()

  return lines.slice(endIdx + 1).join('\n').trim()
}

export const AGENT_PROMPTS = Object.fromEntries(
  Object.entries(rawFiles).map(([path, raw]) => {
    const id = path.split('/').pop().replace('.md', '')
    return [id, parseMd(raw)]
  })
)
