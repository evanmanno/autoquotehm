import { useEffect, useRef, useState } from 'react'
import { buildRenderPrompt, generateConcept, listRenderings, photoToBase64 } from './lib/renderings'
import './concept.css'

// "Project preview": turns a real photo + the quote into concept images.
export function ConceptCard({ job, est, photos, companyId, quoteId, selected, onPick }) {
  const [picked, setPicked] = useState(photos[0]?.id ?? null)
  const [own, setOwn] = useState(null) // {id,name,url} chosen inside this card
  const [extra, setExtra] = useState('')
  const [state, setState] = useState('idle') // idle | working | error
  const [error, setError] = useState('')
  const [results, setResults] = useState([]) // [{id, urls}]
  const [remaining, setRemaining] = useState(null)
  const fileRef = useRef(null)

  const sources = own ? [...photos, own] : photos
  const active = sources.find((p) => p.id === picked) ?? sources[0] ?? null
  const hasWork = (est?.lineItems ?? []).some((i) => !i.tbd)

  useEffect(() => {
    let live = true
    listRenderings(quoteId)
      .then((r) => live && setResults(r))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [quoteId])

  const choose = (file) => {
    if (!file) return
    const p = { id: `own-${file.name}-${file.size}`, name: file.name, url: URL.createObjectURL(file) }
    setOwn(p)
    setPicked(p.id)
  }

  const run = async () => {
    setState('working')
    setError('')
    try {
      const imageBase64 = active ? await photoToBase64(active.url) : null
      const prompt = buildRenderPrompt(job, est, extra.trim(), !active)
      const out = await generateConcept({ companyId, quoteId, prompt, imageBase64, n: 2 })
      setResults((prev) => [{ id: out.id, urls: out.images }, ...prev])
      setRemaining(out.remaining ?? null)
      setState('idle')
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
      setState('error')
    }
  }

  return (
    <section className="card concept">
      <header className="card-head">
        <h2>
          Project preview <span className="beta">New</span>
        </h2>
        <p>Show the customer what the finished job could look like, built from this quote.</p>
      </header>

      {sources.length > 0 ? (
        <div className="concept-photos">
          {sources.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`concept-thumb ${active?.id === p.id ? 'on' : ''}`}
              onClick={() => setPicked(p.id)}
              aria-label={`Use ${p.name}`}
            >
              <img src={p.url} alt={p.name} />
            </button>
          ))}
        </div>
      ) : (
        <p className="concept-empty">
          Add a photo to keep the customer's real property in the picture, or generate a general concept without one.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <button type="button" className="btn ghost small" onClick={() => fileRef.current?.click()}>
        {sources.length ? 'Use a different photo' : 'Choose photo'}
      </button>

      <label className="concept-extra">
        <span>Style notes (optional)</span>
        <input
          type="text"
          value={extra}
          maxLength={200}
          placeholder="e.g. tan travertine pavers, low boxwood hedge, mulch beds"
          onChange={(e) => setExtra(e.target.value)}
        />
      </label>

      {!hasWork && <p className="concept-empty">Select at least one priced service to build a preview.</p>}

      <button
        type="button"
        className="btn primary"
        disabled={!hasWork || state === 'working'}
        onClick={run}
      >
        {state === 'working'
          ? 'Creating concepts… (~30 sec)'
          : results.length
            ? 'Generate again'
            : active
              ? 'Generate concept'
              : 'Generate concept (no photo)'}
      </button>
      {state === 'error' && <p className="error">{error}</p>}
      {remaining != null && <p className="concept-note">{remaining} concept images left this month.</p>}

      {results.map((r) => (
        <div className="concept-set" key={r.id}>
          {r.urls.map((u, i) => (
            <figure key={u}>
              <img src={u} alt={`Concept ${i + 1}`} loading="lazy" />
              <div className="concept-actions">
                <button
                  type="button"
                  className={`btn small ${selected === u ? 'primary' : 'ghost'}`}
                  onClick={() => onPick?.(selected === u ? null : u)}
                >
                  {selected === u ? 'In customer PDF ✓' : 'Add to customer PDF'}
                </button>
                <a href={u} download={`concept-${i + 1}.png`} target="_blank" rel="noreferrer">
                  Save image
                </a>
              </div>
            </figure>
          ))}
        </div>
      ))}

      {results.length > 0 && (
        <p className="concept-note">
          AI concept illustration for visualization only. Final materials, colors, sizes and layout will vary.
        </p>
      )}
    </section>
  )
}
