import { readFileSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET() {
  const html = readFileSync(
    path.join(process.cwd(), 'public', 'landing', 'index.html'),
    'utf-8'
  )
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
