import { useSyncExternalStore } from 'react'
import es from './es'

// Tiny English/Spanish switch. English text is the key: tr('Sign in') returns
// the Spanish version when the language is Spanish and falls back to the
// English text when a translation is missing, so nothing ever shows blank.
const KEY = 'pricr.lang'

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // storage unavailable: fall through to the device language
  }
  return (typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('es'))
    ? 'es'
    : 'en'
}

let lang = initialLang()
const listeners = new Set()

if (typeof document !== 'undefined') document.documentElement.lang = lang

export const getLang = () => lang

export function setLang(next) {
  if (next !== 'en' && next !== 'es') return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // not saved, still applies for this session
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((fn) => fn())
}

// Call in any component that should re-render when the language changes.
export function useLang() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => lang,
  )
}

// tr('Hello {name}', { name: 'Ana' })
export function tr(en, vars) {
  let s = lang === 'es' ? (es[en] ?? en) : en
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
  return s
}
