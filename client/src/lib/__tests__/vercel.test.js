import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// vercel.json is the live routing and security config; tests run from the client folder.
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
const pageHeaders = Object.fromEntries(config.headers.find((h) => h.source.includes('?!api/')).headers.map((h) => [h.key, h.value]))

describe('vercel.json', () => {
  it('forwards /api before the single-page fallback, and the fallback never swallows /api', () => {
    expect(config.rewrites[0].source).toBe('/api/:path*')
    expect(config.rewrites[1].source).toContain('?!api/')
  })

  it('sends the browser security headers on app pages', () => {
    expect(pageHeaders['X-Content-Type-Options']).toBe('nosniff')
    expect(pageHeaders['X-Frame-Options']).toBe('DENY')
    expect(pageHeaders['Referrer-Policy']).toBeTruthy()
    const csp = pageHeaders['Content-Security-Policy']
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toMatch(/script-src 'self'(;|$)/) // no 'unsafe-inline' for scripts
  })

  it('the page has no inline script, which the policy would block', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag).toContain('src=')
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })
})
