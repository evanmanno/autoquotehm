import { useSyncExternalStore } from 'react'
import es from './es'
import pt from './pt'

// Language switch. English text is the key: tr('Sign in') returns the
// translation when the app is in another language and falls back to the
// English text when a translation is missing, so nothing ever shows blank.
//
// To add a language: drop a dictionary in src/lib/langs/<code>.js (copy any
// existing one and translate the values), add a loader line to LOADERS and an
// entry to LANGUAGES below. Spanish and Portuguese ship in the main bundle;
// the rest load only when someone picks them.
const KEY = 'pricr.lang'

export const LANGUAGES = [
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-US' },
  { id: 'pt', name: 'Português', locale: 'pt-BR' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'ht', name: 'Kreyòl ayisyen', locale: 'ht-HT' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'pl', name: 'Polski', locale: 'pl-PL' },
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'vi', name: 'Tiếng Việt', locale: 'vi-VN' },
  { id: 'zh', name: '中文（简体）', locale: 'zh-CN' },
]

const LOADERS = {
  fr: () => import('./langs/fr.js'),
  ht: () => import('./langs/ht.js'),
  it: () => import('./langs/it.js'),
  pl: () => import('./langs/pl.js'),
  ru: () => import('./langs/ru.js'),
  vi: () => import('./langs/vi.js'),
  zh: () => import('./langs/zh.js'),
}

const dicts = { en: null, es, pt }
const known = (id) => LANGUAGES.some((l) => l.id === id)

function startingLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (known(saved)) return saved
  } catch {
    // storage unavailable: fall through to the device language
  }
  const prefs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || []
  for (const p of prefs) {
    const id = String(p || '').toLowerCase().split('-')[0]
    if (known(id)) return id
  }
  return 'en'
}

let lang = 'en'
let dict = null
let wanted = 'en'
const listeners = new Set()

function apply(id, d, save) {
  lang = id
  dict = d
  if (save) {
    try {
      localStorage.setItem(KEY, id)
    } catch {
      // not saved, still applies for this session
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANGUAGES.find((l) => l.id === id).locale
  }
  listeners.forEach((fn) => fn())
}

export const getLang = () => lang
export const getLocale = () => LANGUAGES.find((l) => l.id === lang)?.locale || 'en-US'

export function setLang(next, save = true) {
  if (!known(next)) return
  wanted = next
  if (next in dicts) {
    apply(next, dicts[next], save)
    return
  }
  LOADERS[next]()
    .then((m) => {
      dicts[next] = m.default
      if (wanted === next) apply(next, m.default, save)
    })
    .catch(() => {
      // couldn't fetch the language file (offline): stay on the current one
    })
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
  let s = (dict && dict[en]) ?? en
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
  return s
}

setLang(startingLang(), false)
