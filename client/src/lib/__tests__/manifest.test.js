import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// The home-screen manifest: valid JSON, the right display mode, and every icon it names exists with its stated size.
const publicDir = resolve(process.cwd(), 'public')
const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf8'))

const pngSize = (file) => {
  const data = readFileSync(file)
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // the PNG signature
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`
}

describe('manifest.webmanifest', () => {
  it('names the app and opens full screen from the home screen', () => {
    expect(manifest).toMatchObject({ name: 'Evenly', short_name: 'Evenly', start_url: '/', display: 'standalone' })
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('lists 192 and 512 icons, and one maskable', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('every icon file exists and is the size the manifest says', () => {
    for (const icon of manifest.icons) {
      const file = resolve(publicDir, icon.src.slice(1))
      expect(existsSync(file), icon.src).toBe(true)
      expect(pngSize(file), icon.src).toBe(icon.sizes)
    }
  })

  it('has an Apple touch icon, and index.html links both', () => {
    expect(pngSize(resolve(publicDir, 'icons/apple-touch-icon.png'))).toBe('180x180')
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon"')
  })
})
