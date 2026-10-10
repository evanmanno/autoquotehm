import { setLang, useLang } from './lib/i18n'

// English | Español switch. Used on the sign-in screen and in Settings.
export default function LangToggle({ className = '' }) {
  const lang = useLang()
  return (
    <div className={`lang-toggle ${className}`} role="radiogroup" aria-label="Language / Idioma">
      {[
        ['en', 'English'],
        ['es', 'Español'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={lang === id}
          className={lang === id ? 'on' : ''}
          onClick={() => setLang(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
