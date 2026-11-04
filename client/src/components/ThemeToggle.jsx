import { useState } from 'react'
import { getTheme, setTheme } from '../lib/theme.js'
import { Icon } from './Icon.jsx'

// What the screen looks like right now, even when the choice is "System" (follow the phone).
const shown = () => {
  const choice = getTheme()
  if (choice !== 'system') return choice
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// One tap switches between dark and light, from anywhere. The icon shows where a tap will take you.
// Settings still has the three-way choice (System, Dark, Light).
export function ThemeToggle({ className = '' }) {
  const [theme, setCurrent] = useState(shown)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => { setTheme(next); setCurrent(next) }}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-[transform,color] duration-100 hover:text-ink active:scale-90 ${className}`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}
