import { useEffect, useRef, useState } from 'react'

// Address field with a dropdown of suggestions as you type (Google Places
// "Autocomplete (New)"). It needs VITE_GOOGLE_MAPS_KEY. Without a key it is
// just a normal text box, so nothing breaks while the key isn't set up.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete'

const newToken = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2)

export default function AddressInput({ value, onChange, placeholder, multiline = false, rows = 2 }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false) // only search after the person actually typed
  const token = useRef(newToken())
  const timer = useRef(null)
  const seq = useRef(0)
  const box = useRef(null)

  useEffect(() => {
    if (!KEY || !typed.current) return
    const q = (value || '').trim()
    if (q.length < 3) {
      setItems([])
      return
    }
    clearTimeout(timer.current)
    const mine = ++seq.current
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
          body: JSON.stringify({
            input: q,
            sessionToken: token.current,
            includedRegionCodes: ['us'],
          }),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (mine !== seq.current) return // a newer search replaced this one
        const list = (data.suggestions || [])
          .map((s) => s.placePrediction)
          .filter(Boolean)
          .map((p) => ({
            id: p.placeId,
            main: p.structuredFormat?.mainText?.text || p.text?.text || '',
            second: p.structuredFormat?.secondaryText?.text || '',
            full: p.text?.text || '',
          }))
          .slice(0, 5)
        setItems(list)
        setActive(-1)
      } catch {
        if (mine === seq.current) setItems([]) // fail quietly: the box still works by hand
      }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [value])

  const pick = (item) => {
    typed.current = false
    seq.current++
    onChange(item.full)
    setItems([])
    setOpen(false)
    token.current = newToken() // a picked address ends the billing session
  }

  const onKeyDown = (e) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const common = {
    value,
    placeholder,
    autoComplete: 'off',
    onChange: (e) => {
      typed.current = true
      setOpen(true)
      onChange(e.target.value)
    },
    onFocus: () => setOpen(true),
    onBlur: () => setTimeout(() => setOpen(false), 120),
    onKeyDown,
  }

  return (
    <div className="addr-wrap" ref={box}>
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
      {open && items.length > 0 && (
        <ul className="addr-list" role="listbox">
          {items.map((it, i) => (
            <li key={it.id || it.full} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus so the click lands before blur
                  pick(it)
                }}
              >
                <strong>{it.main}</strong>
                {it.second && <span>{it.second}</span>}
              </button>
            </li>
          ))}
          <li className="addr-attrib">Powered by Google</li>
        </ul>
      )}
    </div>
  )
}
