import { readFileSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function GET() {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  let html = readFileSync(
    path.join(process.cwd(), 'public', 'landing', 'index.html'),
    'utf-8'
  )
  // Inject the publishable key so the landing page can initialise Clerk
  html = html.replace(
    '</head>',
    `<script>window.__CLERK_KEY__=${JSON.stringify(clerkKey)};</script></head>`
  )
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
