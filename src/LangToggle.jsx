import { LANGUAGES, setLang, useLang } from './lib/i18n'

// Language dropdown. Used on the sign-in screen and in Settings.
export default function LangToggle({ className = '' }) {
  const lang = useLang()
  return (
    <label className={`lang-select ${className}`}>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language / Idioma / Idioma">
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
