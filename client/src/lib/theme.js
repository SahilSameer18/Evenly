// 'system' follows the phone; 'dark' and 'light' override it. Kept in localStorage as a per-device convenience.
const KEY = 'evenly.theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) ?? 'system' } catch { return 'system' }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme) } catch { /* the choice still applies until the page closes */ }
  applyTheme(theme)
}

export function applyTheme(theme = getTheme()) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}
