// Light / dark appearance. Stored on this device only; dark is the default.
const KEY = 'aqhm-theme'
const COLORS = { dark: '#0d0f11', light: '#f6f7f8' }

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme = getTheme()) {
  const t = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', COLORS[t])
  return t
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme === 'light' ? 'light' : 'dark')
  } catch {
    // private mode: the choice just won't be remembered
  }
  return applyTheme(theme)
}
