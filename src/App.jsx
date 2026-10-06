import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DUMP_FEE,
  INDUSTRIES,
  INDUSTRY_EQUIPMENT,
  INDUSTRY_SERVICES,
  SNOW_DEPTH,
  LABOR_RATE,
  MILEAGE_RATE,
  MIN_JOB_CHARGE,
  PROFIT_MARGIN,
  TRIP_MINIMUM,
  UNIT_LABEL,
  equipmentById,
  estimate,
  makeId,
  money,
  num,
  qty,
} from './pricing'
import { isConfigured, sendQuote } from './email'
import logoIcon from './assets/logo-icon.png'
import { getInitialSession, onAuthChange, signIn, signOut, signUp } from './lib/auth'
import { deleteCompany, fetchCompany, saveCompany, uploadLogo } from './lib/companyStore'
import { buildQuotePdf } from './lib/quotePdf'

const STEPS = ['Property', 'Services', 'Job Details', 'Quote']

const STORAGE_KEY = 'quotescapes-draft'

// One-time migration from the old VRS-branded storage key for the local job
// draft. Business profile/materials/equipment now live in the database
// (see src/lib/companyStore.js), not localStorage.
const LEGACY_STORAGE_KEY = 'vrs-estimator-draft'

const emptyCompany = {
  // Sign In — the person using the app on this device
  crewMemberName: '',
  yourEmail: '',
  yourPhone: '',
  // Business — the company these quotes go out under
  businessName: '',
  shopAddress: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  // Pricing
  laborRate: LABOR_RATE,
  mileageRate: MILEAGE_RATE,
  dumpFee: DUMP_FEE,
  minJobCharge: MIN_JOB_CHARGE,
  tripMinimum: TRIP_MINIMUM,
  defaultMargin: PROFIT_MARGIN,
  industries: [],
  materials: [],
  equipment: [],
}

const emptyJob = {
  customerName: '',
  phone: '',
  address: '',
  services: [],
  squareFootage: '',
  yards: {},
  serviceSqft: {},
  serviceQty: {},
  snowDepth: 'light',
  snowVisits: '1',
  laborHours: '',
  crewMembers: '2',
  crew: 'Crew 1',
  equipment: '',
  equipmentSelected: {},
  driveMiles: '',
  fuelCost: '',
  dumpLoads: '',
  notes: '',
}

function loadDraft() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        raw = legacy
        localStorage.setItem(STORAGE_KEY, legacy)
      }
    }
    const saved = JSON.parse(raw)
    return saved ? { ...emptyJob, ...saved } : emptyJob
  } catch {
    return emptyJob
  }
}

export default function App() {
  const [step, setStep] = useState(0)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [company, setCompany] = useState(null)
  const [companyLoading, setCompanyLoading] = useState(true)
  const [editingCompany, setEditingCompany] = useState(false)
  const [onboardingKey, setOnboardingKey] = useState(0)
  const [job, setJob] = useState(loadDraft)
  const [photos, setPhotos] = useState([])
  const [sendState, setSendState] = useState('idle') // idle | sending | sent | error
  const [sendError, setSendError] = useState('')
  const [pdfState, setPdfState] = useState('idle') // idle | generating
  const topRef = useRef(null)

  // Photos hold blob URLs, so they are intentionally left out of the draft.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(job))
  }, [job])

  // Track the logged-in account. Each business signs in on its own, from
  // any device -- this replaces the old "whatever's in this browser" model.
  useEffect(() => {
    let active = true
    getInitialSession()
      .then((s) => {
        if (!active) return
        setSession(s)
        setAuthReady(true)
      })
      .catch((err) => {
        console.error('Failed to load session:', err)
        if (!active) return
        setSession(null)
        setAuthReady(true)
      })
    const unsubscribe = onAuthChange((s) => {
      setSession(s)
      setAuthReady(true)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // Load this business's profile/materials/equipment from the database
  // whenever the logged-in account changes.
  useEffect(() => {
    if (!session) {
      setCompany(null)
      setCompanyLoading(false)
      return
    }
    let active = true
    setCompanyLoading(true)
    fetchCompany()
      .then((c) => {
        if (active) setCompany(c)
      })
      .catch((err) => {
        console.error('Failed to load company:', err)
        if (active) setCompany(null)
      })
      .finally(() => {
        if (active) setCompanyLoading(false)
      })
    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' })
  }, [step])

  const set = (key) => (value) => setJob((j) => ({ ...j, [key]: value }))

  const setNested = (key, id) => (value) =>
    setJob((j) => ({ ...j, [key]: { ...j[key], [id]: value } }))

  const toggleService = (id) =>
    setJob((j) => ({
      ...j,
      services: j.services.includes(id)
        ? j.services.filter((s) => s !== id)
        : [...j.services, id],
    }))

  const toggleEquipment = (id) =>
    setJob((j) => {
      const current = { ...j.equipmentSelected }
      if (current[id] != null) {
        delete current[id]
      } else {
        current[id] = '1'
      }
      return { ...j, equipmentSelected: current }
    })

  const est = useMemo(() => estimate(job, company ?? emptyCompany), [job, company])

  const materials = company?.materials ?? []
  const equipmentList = company?.equipment ?? []
  const selected = materials.filter((s) => job.services.includes(s.id))
  const yardServices = selected.filter((s) => s.unit === 'yard')
  const sqftServices = selected.filter((s) => s.unit === 'sqft')
  const eachServices = selected.filter((s) => s.unit === 'each')
  const linearFtServices = selected.filter((s) => s.unit === 'linear-ft')
  const hasSnowServices = selected.some((s) => s.perVisit || s.depthScaled)

  const canAdvance =
    step === 0
      ? job.customerName.trim() !== '' && job.address.trim() !== ''
      : step === 1
        ? job.services.length > 0
        : true

  const addPhotos = (files) => {
    const added = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [
      ...prev,
      ...added.filter((a) => !prev.some((p) => p.id === a.id)),
    ])
  }

  const removePhoto = (id) =>
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.id !== id)
    })

  const sendToOffice = async () => {
    setSendState('sending')
    setSendError('')
    try {
      await sendQuote(job, est, photos.length, company)
      setSendState('sent')
    } catch (err) {
      setSendError(err?.text || err?.message || 'Email failed to send.')
      setSendState('error')
    }
  }

  const downloadPdf = async () => {
    setPdfState('generating')
    try {
      await buildQuotePdf(job, est, company, photos.length)
      setPdfState('idle')
    } catch (err) {
      console.error('PDF generation failed:', err)
      setPdfState('idle')
      alert('Could not build the PDF. Try again.')
    }
  }

  const startNew = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setJob(emptyJob)
    setSendState('idle')
    setSendError('')
    setStep(0)
  }

  const signOutNow = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setJob(emptyJob)
    setSendState('idle')
    setSendError('')
    setStep(0)
    setEditingCompany(false)
    setOnboardingKey((k) => k + 1)
  }

  const quickSignOut = () => {
    if (window.confirm('Sign out of AutoQuoteHM on this device?')) {
      signOutNow()
    }
  }

  // Permanently deletes this business's row from the database, then signs
  // out. Distinct from quickSignOut -- this one can't be undone.
  const deleteAllData = async () => {
    if (session) {
      try {
        await deleteCompany(session.user.id)
      } catch (err) {
        console.error('Delete failed:', err)
      }
    }
    await signOutNow()
  }

  if (!authReady || (session && companyLoading)) {
    return (
      <div className="app">
        <div className="hero">
          <span className="hero-mark" aria-hidden="true">
            <img src={logoIcon} alt="" />
          </span>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (!company || editingCompany) {
    return (
      <Onboarding
        key={onboardingKey}
        initial={company ?? emptyCompany}
        onSave={async (profile) => {
          try {
            const saved = await saveCompany(profile, session.user.id)
            setCompany(saved)
            setEditingCompany(false)
          } catch (err) {
            console.error('Save failed:', err)
            alert(
              err?.message ||
                'Could not save your business info. Check your connection and try again.',
            )
          }
        }}
        onCancel={company ? () => setEditingCompany(false) : undefined}
        onReset={company ? deleteAllData : undefined}
        onSignOut={quickSignOut}
        ownerId={session?.user?.id}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar" ref={topRef}>
        <div className="topbar-row">
          <div className="brand">
            <span className="mark">
              <img src={logoIcon} alt="" />
            </span>
            <span className="brand-text">
              AutoQuoteHM
              <small>{company.businessName || 'Quote Estimator'}</small>
            </span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="topbar-reset" onClick={quickSignOut}>
              Sign Out
            </button>
            <button
              type="button"
              className="profile-btn"
              onClick={() => setEditingCompany(true)}
            >
              {company.crewMemberName || 'Profile'}
            </button>
          </div>
        </div>

        <div className="progress">
          <div className="track">
            <div
              className="fill"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          <div className="steps">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`step ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`}
                onClick={() => i < step && setStep(i)}
                disabled={i >= step}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="content">
        {step === 0 && (
          <Section
            title="Property Info"
            hint="Who and where. Everything else builds off this."
          >
            <Field label="Customer name" required>
              <input
                value={job.customerName}
                onChange={(e) => set('customerName')(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </Field>
            <Field label="Phone number">
              <input
                value={job.phone}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="(555) 123-4567"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field label="Property address" required>
              <textarea
                value={job.address}
                onChange={(e) => set('address')(e.target.value)}
                placeholder="12 Elm St, Springfield, MA"
                rows={3}
              />
            </Field>
          </Section>
        )}

        {step === 1 && (
          <Section
            title="Services Needed"
            hint="Tap everything this job covers. You can change it later."
          >
            <div className="service-list">
              {materials.map((service) => {
                const on = job.services.includes(service.id)
                return (
                  <button
                    key={service.id}
                    type="button"
                    className={`service ${on ? 'on' : ''}`}
                    onClick={() => toggleService(service.id)}
                    aria-pressed={on}
                  >
                    <span className="check" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span className="service-text">
                      <strong>{service.name}</strong>
                      <small>
                        {service.unit === 'tbd'
                          ? 'Priced separately — TBD'
                          : `${money(service.rate)} / ${UNIT_LABEL[service.unit]}${
                              service.note ? ` · ${service.note}` : ''
                            }`}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="counter">
              {job.services.length} service{job.services.length === 1 ? '' : 's'} selected
            </p>
          </Section>
        )}

        {step === 2 && (
          <>
            <Section title="Job Details" hint="Measurements drive the material cost.">
              <Field label="Property square footage">
                <NumInput
                  value={job.squareFootage}
                  onChange={set('squareFootage')}
                  placeholder="0"
                  suffix="sq ft"
                />
              </Field>

              {yardServices.length > 0 && (
                <div className="subgroup">
                  <h3>Material needed</h3>
                  {yardServices.map((service) => (
                    <Field key={service.id} label={service.name}>
                      <NumInput
                        value={job.yards[service.id] ?? ''}
                        onChange={setNested('yards', service.id)}
                        placeholder="0"
                        suffix="yd³"
                      />
                    </Field>
                  ))}
                </div>
              )}

              {sqftServices.length > 0 && (
                <div className="subgroup">
                  <h3>Area per service</h3>
                  <p className="subgroup-hint">
                    Leave blank to use the property square footage above.
                  </p>
                  {sqftServices.map((service) => (
                    <Field key={service.id} label={service.name}>
                      <NumInput
                        value={job.serviceSqft[service.id] ?? ''}
                        onChange={setNested('serviceSqft', service.id)}
                        placeholder={
                          num(job.squareFootage)
                            ? qty(num(job.squareFootage))
                            : '0'
                        }
                        suffix="sq ft"
                      />
                    </Field>
                  ))}
                </div>
              )}

              {linearFtServices.length > 0 && (
                <div className="subgroup">
                  <h3>Linear footage</h3>
                  {linearFtServices.map((service) => (
                    <Field key={service.id} label={service.name}>
                      <NumInput
                        value={job.serviceQty[service.id] ?? ''}
                        onChange={setNested('serviceQty', service.id)}
                        placeholder="0"
                        suffix="lin ft"
                      />
                    </Field>
                  ))}
                </div>
              )}

              {eachServices.length > 0 && (
                <div className="subgroup">
                  <h3>Count</h3>
                  {eachServices.map((service) => (
                    <Field key={service.id} label={service.name}>
                      <NumInput
                        value={job.serviceQty[service.id] ?? ''}
                        onChange={setNested('serviceQty', service.id)}
                        placeholder="0"
                        suffix="ea"
                      />
                    </Field>
                  ))}
                </div>
              )}

              {hasSnowServices && (
                <div className="subgroup">
                  <h3>Snow conditions</h3>
                  <p className="subgroup-hint">
                    Plowing and shoveling scale with depth; every snow service multiplies by the
                    number of pushes. Quoting a seasonal contract? Enter the visits you expect.
                  </p>
                  <Field label="Snowfall depth">
                    <div className="segmented">
                      {SNOW_DEPTH.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className={job.snowDepth === d.id ? 'on' : ''}
                          onClick={() => set('snowDepth')(d.id)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Pushes / visits">
                    <NumInput
                      value={job.snowVisits}
                      onChange={set('snowVisits')}
                      placeholder="1"
                      suffix="visits"
                    />
                  </Field>
                </div>
              )}
            </Section>

            <Section title="Crew & Equipment">
              <div className="row">
                <Field label="Labor hours">
                  <NumInput
                    value={job.laborHours}
                    onChange={set('laborHours')}
                    placeholder="0"
                    suffix="hrs"
                  />
                </Field>
                <Field label="Crew members">
                  <NumInput
                    value={job.crewMembers}
                    onChange={set('crewMembers')}
                    placeholder="0"
                    suffix="ppl"
                  />
                </Field>
              </div>

              <Field label="Which crew">
                <div className="segmented">
                  {['Crew 1', 'Crew 2'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={job.crew === c ? 'on' : ''}
                      onClick={() => set('crew')(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="subgroup">
                <h3>Equipment used</h3>
                <div className="service-list">
                  {equipmentList.map((item) => {
                    const on = job.equipmentSelected[item.id] != null
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`service ${on ? 'on' : ''}`}
                        onClick={() => toggleEquipment(item.id)}
                        aria-pressed={on}
                      >
                        <span className="check" aria-hidden="true">
                          {on ? '✓' : ''}
                        </span>
                        <span className="service-text">
                          <strong>{item.name}</strong>
                          <small>{money(item.rate)} / day</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {Object.keys(job.equipmentSelected).length > 0 && (
                  <div className="row">
                    {Object.keys(job.equipmentSelected).map((id) => (
                      <Field
                        key={id}
                        label={`${equipmentById(equipmentList, id)?.name ?? id} — days`}
                      >
                        <NumInput
                          value={job.equipmentSelected[id] ?? ''}
                          onChange={setNested('equipmentSelected', id)}
                          placeholder="1"
                          suffix="days"
                        />
                      </Field>
                    ))}
                  </div>
                )}
              </div>

              <div className="row">
                <Field label="Drive distance (one-way)">
                  <NumInput
                    value={job.driveMiles}
                    onChange={set('driveMiles')}
                    placeholder="0"
                    suffix="mi"
                  />
                </Field>
                <Field label="Equipment fuel cost">
                  <NumInput
                    value={job.fuelCost}
                    onChange={set('fuelCost')}
                    placeholder="0"
                    suffix="$"
                  />
                </Field>
              </div>

              <Field label="Dump loads">
                <NumInput
                  value={job.dumpLoads}
                  onChange={set('dumpLoads')}
                  placeholder="0"
                  suffix="loads"
                />
              </Field>

              <Field label="Other equipment / notes">
                <textarea
                  value={job.equipment}
                  onChange={(e) => set('equipment')(e.target.value)}
                  placeholder="Anything not listed above…"
                  rows={2}
                />
              </Field>

              <Field label="Job notes">
                <textarea
                  value={job.notes}
                  onChange={(e) => set('notes')(e.target.value)}
                  placeholder="Access, slope, irrigation, anything the office should know…"
                  rows={4}
                />
              </Field>

              <Field label="Site photos">
                <label className="uploader">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => {
                      addPhotos(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <span className="uploader-icon" aria-hidden="true">
                    +
                  </span>
                  <span>
                    Add photos
                    <small>Camera or library</small>
                  </span>
                </label>
                {photos.length > 0 && (
                  <div className="thumbs">
                    {photos.map((photo) => (
                      <div className="thumb" key={photo.id}>
                        <img src={photo.url} alt={photo.name} />
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          aria-label={`Remove ${photo.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </Section>

            <div className="live-total">
              <span>Running quote</span>
              <strong>{money(est.quotePrice)}</strong>
            </div>
          </>
        )}

        {step === 3 && (
          <Quote
            job={job}
            est={est}
            company={company}
            photoCount={photos.length}
            sendState={sendState}
            sendError={sendError}
            onSend={sendToOffice}
            onNew={startNew}
            onBack={() => setStep(2)}
            pdfState={pdfState}
            onDownloadPdf={downloadPdf}
          />
        )}
      </main>

      {step < STEPS.length - 1 && (
        <footer className="footer">
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={!canAdvance}
            onClick={() => setStep(step + 1)}
          >
            {step === STEPS.length - 2 ? 'Review quote' : 'Next'}
          </button>
        </footer>
      )}
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </section>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="field">
      <span className="label">
        {label}
        {required && <em>required</em>}
      </span>
      {children}
    </label>
  )
}

function NumInput({ value, onChange, placeholder, suffix }) {
  return (
    <span className="numwrap">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        placeholder={placeholder}
        inputMode="decimal"
        type="text"
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}

function Quote({
  job,
  est,
  company,
  photoCount,
  sendState,
  sendError,
  onSend,
  onNew,
  onBack,
  pdfState,
  onDownloadPdf,
}) {
  const officeName = company?.contactName?.trim() || 'the office'
  const officeEmail = company?.contactEmail?.trim() || '—'
  const businessName = company?.businessName?.trim() || 'your business'

  if (sendState === 'sent') {
    return (
      <section className="card success">
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        <h2>Sent to {officeName}</h2>
        <p>
          {job.customerName || 'This estimate'} — {money(est.quotePrice)} quote was
          emailed to {officeEmail}.{' '}
          {company?.contactName ? `${company.contactName} will` : "They'll"} take it from
          here.
        </p>
        <button type="button" className="btn primary" onClick={onNew}>
          Start new estimate
        </button>
      </section>
    )
  }

  return (
    <>
      <section className="card quote-head">
        <span className="eyebrow">Quote summary</span>
        <h2>{job.customerName || 'Unnamed customer'}</h2>
        {job.address && <p className="addr">{job.address}</p>}
        <p className="meta">
          {job.crew}
          {est.crewMembers ? ` · ${qty(est.crewMembers)} crew` : ''}
          {job.phone ? ` · ${job.phone}` : ''}
          {photoCount ? ` · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''}
        </p>
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Cost breakdown</h2>
          <p>What the job costs {businessName} to run.</p>
        </header>

        <ul className="breakdown">
          {est.lineItems.map((item) => (
            <li key={item.id}>
              <span className="bd-name">
                {item.name}
                <small>
                  {item.tbd
                    ? 'Not included in totals'
                    : `${qty(item.quantity)} ${item.unitLabel} × ${money(item.rate)}`}
                </small>
              </span>
              <span className={`bd-amt ${item.tbd ? 'tbd' : ''}`}>
                {item.tbd ? 'TBD' : money(item.cost)}
              </span>
            </li>
          ))}
          {est.lineItems.length === 0 && (
            <li className="empty">No services selected.</li>
          )}
          <li>
            <span className="bd-name">
              Labor
              <small>
                {qty(est.laborHours)} hrs × {qty(est.crewMembers)} crew ×{' '}
                {money(est.laborRate)}/hr
              </small>
            </span>
            <span className="bd-amt">{money(est.laborCost)}</span>
          </li>
          {est.equipmentItems.map((item) => (
            <li key={item.id}>
              <span className="bd-name">
                {item.name}
                <small>
                  {qty(item.quantity)} day{item.quantity === 1 ? '' : 's'} × {money(item.rate)}
                </small>
              </span>
              <span className="bd-amt">{money(item.cost)}</span>
            </li>
          ))}
          {est.travelCost > 0 && (
            <li>
              <span className="bd-name">
                Travel
                <small>
                  {qty(est.driveMiles)} mi × 2 (round trip) × {money(est.mileageRate)}/mi
                </small>
              </span>
              <span className="bd-amt">{money(est.travelCost)}</span>
            </li>
          )}
          {est.fuelCost > 0 && (
            <li>
              <span className="bd-name">Equipment fuel</span>
              <span className="bd-amt">{money(est.fuelCost)}</span>
            </li>
          )}
          {est.disposalCost > 0 && (
            <li>
              <span className="bd-name">
                Disposal
                <small>
                  {qty(est.dumpLoads)} load{est.dumpLoads === 1 ? '' : 's'} × {money(est.dumpFee)}
                </small>
              </span>
              <span className="bd-amt">{money(est.disposalCost)}</span>
            </li>
          )}
        </ul>

        <div className="totals">
          <div className="total-row">
            <span>Total cost</span>
            <strong>{money(est.totalCost)}</strong>
          </div>
          <div className="total-row accent">
            <span>Profit margin ({Math.round(est.profitMargin * 100)}% of quote)</span>
            <strong>{money(est.profitAmount)}</strong>
          </div>
          <div className="total-row final">
            <span>Customer quote</span>
            <strong>{money(est.quotePrice)}</strong>
          </div>
        </div>

        {est.belowMinimum && (
          <p className="tbd-note">
            Raised to the {money(est.minJobCharge)} minimum job charge.
          </p>
        )}

        {est.hasTbd && (
          <p className="tbd-note">
            Excludes{' '}
            {est.lineItems
              .filter((item) => item.tbd)
              .map((item) => item.name)
              .join(' and ')}{' '}
            — {officeName} prices {est.lineItems.filter((i) => i.tbd).length > 1 ? 'those' : 'that'}{' '}
            separately.
          </p>
        )}
      </section>

      {(job.equipment || job.notes) && (
        <section className="card">
          <header className="card-head">
            <h2>Site notes</h2>
          </header>
          {job.equipment && (
            <div className="note-block">
              <h3>Other equipment / notes</h3>
              <p>{job.equipment}</p>
            </div>
          )}
          {job.notes && (
            <div className="note-block">
              <h3>Notes</h3>
              <p>{job.notes}</p>
            </div>
          )}
        </section>
      )}

      {!isConfigured && (
        <p className="banner warn">
          EmailJS keys are missing. Add <code>VITE_EMAILJS_SERVICE_ID</code>,{' '}
          <code>VITE_EMAILJS_TEMPLATE_ID</code> and <code>VITE_EMAILJS_PUBLIC_KEY</code>{' '}
          to <code>.env.local</code>, then restart the server.
        </p>
      )}

      {sendState === 'error' && <p className="banner error">{sendError}</p>}

      <footer className="footer footer--stacked">
        <div className="footer-row">
          <button type="button" className="btn ghost" onClick={onBack}>
            Edit
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={onDownloadPdf}
            disabled={pdfState === 'generating'}
          >
            {pdfState === 'generating' ? 'Building PDF…' : 'Download PDF'}
          </button>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={onSend}
          disabled={sendState === 'sending'}
        >
          {sendState === 'sending'
            ? 'Sending…'
            : sendState === 'error'
              ? 'Try again'
              : company?.contactName
                ? `Send to ${company.contactName}`
                : 'Send quote'}
        </button>
      </footer>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onboarding / Company Settings
//
// First run walks through Welcome → Sign In → Business → Materials →
// Equipment → Rates → Margins in order. Reopening from the profile pill
// (onCancel is set) jumps straight to Sign In and lets you move between any
// of the settings tabs freely, since there's no funnel to protect there.
// ---------------------------------------------------------------------------

const FORM_STEPS = ['Sign In', 'Business', 'Materials', 'Equipment', 'Rates', 'Margins']

function Login() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { session } = await signUp(email.trim(), password)
        if (!session) {
          setCheckEmail(true)
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand">
              <span className="mark">
                <img src={logoIcon} alt="" />
              </span>
              <span className="brand-text">AutoQuoteHM</span>
            </div>
          </div>
        </header>
        <main className="content">
          <div className="hero">
            <span className="hero-mark" aria-hidden="true">
              <img src={logoIcon} alt="" />
            </span>
            <h1>Check your email</h1>
            <p>
              We sent a confirmation link to {email}. Click it, then come back here and
              sign in.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setCheckEmail(false)
                setMode('signin')
              }}
            >
              Back to sign in
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="mark">
              <img src={logoIcon} alt="" />
            </span>
            <span className="brand-text">AutoQuoteHM</span>
          </div>
        </div>
      </header>
      <main className="content">
        <div className="hero">
          <span className="hero-mark" aria-hidden="true">
            <img src={logoIcon} alt="" />
          </span>
          <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p>
            {mode === 'signup'
              ? "One login for your whole business \u2014 use it on any device."
              : 'Sign in to your AutoQuoteHM account.'}
          </p>
          <form className="auth-form" onSubmit={submit}>
            <Field label="Email" required>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
              />
            </Field>
            <Field label="Password" required>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
              />
            </Field>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn primary auth-submit" disabled={busy}>
              {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <button
            type="button"
            className="link-plain"
            onClick={() => {
              setMode((m) => (m === 'signup' ? 'signin' : 'signup'))
              setError('')
            }}
          >
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "New here? Create an account"}
          </button>
        </div>
      </main>
    </div>
  )
}

// Figures out which trade chips should show as checked for a business whose
// Materials/Equipment predate the industry picker (or were never tagged) --
// a trade counts as "on" if any of its starter service OR equipment ids are
// already present, so the checkbox state matches what's actually there.
function inferIndustries(materials, equipment) {
  const materialIds = new Set((materials ?? []).map((m) => m.id))
  const equipmentIds = new Set((equipment ?? []).map((e) => e.id))
  return INDUSTRIES.filter(
    (ind) =>
      (INDUSTRY_SERVICES[ind.id] ?? []).some((s) => materialIds.has(s.id)) ||
      (INDUSTRY_EQUIPMENT[ind.id] ?? []).some((e) => equipmentIds.has(e.id)),
  ).map((ind) => ind.id)
}

function Onboarding({ initial, onSave, onCancel, onReset, onSignOut, ownerId }) {
  const [obStep, setObStep] = useState(onCancel ? 1 : 0)
  const [confirmReset, setConfirmReset] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    crewMemberName: initial.crewMemberName,
    yourEmail: initial.yourEmail ?? '',
    yourPhone: initial.yourPhone ?? '',
    businessName: initial.businessName,
    shopAddress: initial.shopAddress,
    contactName: initial.contactName,
    contactEmail: initial.contactEmail,
    contactPhone: initial.contactPhone,
    laborRate: String(initial.laborRate ?? ''),
    mileageRate: String(initial.mileageRate ?? ''),
    dumpFee: String(initial.dumpFee ?? ''),
    minJobCharge: String(initial.minJobCharge ?? ''),
    tripMinimum: String(initial.tripMinimum ?? ''),
    salesTaxPct: initial.salesTaxRate != null ? String(initial.salesTaxRate) : '',
    marginPct: String(Math.round((initial.defaultMargin ?? PROFIT_MARGIN) * 100)),
    materials: (initial.materials ?? []).map((m) => ({ ...m, rate: String(m.rate ?? '') })),
    equipment: (initial.equipment ?? []).map((e) => ({ ...e, rate: String(e.rate ?? '') })),
    logoUrl: initial.logoUrl ?? '',
    brandColor: initial.brandColor || '#1f6f45',
    industries:
      initial.industries && initial.industries.length
        ? initial.industries
        : inferIndustries(initial.materials, initial.equipment),
  }))

  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')

  const handleLogoFile = async (file) => {
    if (!file || !ownerId) return
    setLogoError('')
    setLogoUploading(true)
    try {
      const url = await uploadLogo(file, ownerId)
      setField('logoUrl')(url)
    } catch (err) {
      setLogoError(err?.message || 'Upload failed. Try a smaller image.')
    } finally {
      setLogoUploading(false)
    }
  }

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  // Checking a trade seeds its starter Materials AND Equipment (skipping any
  // id already present); unchecking removes exactly that trade's starter
  // items (by id) so the lists only have what's necessary for what's
  // checked. Anything you've added yourself is never touched -- custom
  // entries don't carry an industry id.
  const toggleIndustry = (id) =>
    setForm((f) => {
      const has = f.industries.includes(id)
      const serviceTemplate = INDUSTRY_SERVICES[id] ?? []
      const equipmentTemplate = INDUSTRY_EQUIPMENT[id] ?? []
      const serviceIds = new Set(serviceTemplate.map((s) => s.id))
      const equipmentIds = new Set(equipmentTemplate.map((e) => e.id))
      if (has) {
        return {
          ...f,
          industries: f.industries.filter((i) => i !== id),
          materials: f.materials.filter((m) => !serviceIds.has(m.id)),
          equipment: f.equipment.filter((e) => !equipmentIds.has(e.id)),
        }
      }
      const existingServiceIds = new Set(f.materials.map((m) => m.id))
      const serviceAdditions = serviceTemplate
        .filter((s) => !existingServiceIds.has(s.id))
        .map((s) => ({ ...s, rate: String(s.rate ?? '') }))
      const existingEquipmentIds = new Set(f.equipment.map((e) => e.id))
      const equipmentAdditions = equipmentTemplate
        .filter((e) => !existingEquipmentIds.has(e.id))
        .map((e) => ({ ...e, rate: String(e.rate ?? '') }))
      return {
        ...f,
        industries: [...f.industries, id],
        materials: [...f.materials, ...serviceAdditions],
        equipment: [...f.equipment, ...equipmentAdditions],
      }
    })

  const updateMaterial = (index, patch) =>
    setForm((f) => ({
      ...f,
      materials: f.materials.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }))

  const addMaterial = () =>
    setForm((f) => ({
      ...f,
      materials: [...f.materials, { id: makeId(), name: '', unit: 'yard', rate: '', note: '' }],
    }))

  const removeMaterial = (index) =>
    setForm((f) => ({ ...f, materials: f.materials.filter((_, i) => i !== index) }))

  const updateEquipment = (index, patch) =>
    setForm((f) => ({
      ...f,
      equipment: f.equipment.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }))

  const addEquipment = () =>
    setForm((f) => ({
      ...f,
      equipment: [...f.equipment, { id: makeId(), name: '', rate: '' }],
    }))

  const removeEquipment = (index) =>
    setForm((f) => ({ ...f, equipment: f.equipment.filter((_, i) => i !== index) }))

  const canSave = form.businessName.trim() !== '' && form.crewMemberName.trim() !== ''

  const save = async () => {
    if (!canSave || saving) return
    const pct = Math.min(70, Math.max(10, num(form.marginPct) || 52))
    setSaving(true)
    try {
      await onSave({
      crewMemberName: form.crewMemberName.trim(),
      yourEmail: form.yourEmail.trim(),
      yourPhone: form.yourPhone.trim(),
      businessName: form.businessName.trim(),
      shopAddress: form.shopAddress.trim(),
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      laborRate: num(form.laborRate) || LABOR_RATE,
      mileageRate: num(form.mileageRate) || MILEAGE_RATE,
      dumpFee: num(form.dumpFee) || 0,
      minJobCharge: num(form.minJobCharge) || 0,
      tripMinimum: num(form.tripMinimum) || 0,
      // Only sent once a rate has been entered, so saving keeps working on a
      // database that hasn't had migration_05_sales_tax.sql run yet.
      ...(form.salesTaxPct.trim() !== '' || initial.salesTaxRate != null
        ? { salesTaxRate: num(form.salesTaxPct) || 0 }
        : {}),
      defaultMargin: pct / 100,
      industries: form.industries,
      materials: form.materials
        .filter((m) => m.name.trim() !== '')
        .map((m) => ({
          id: m.id,
          name: m.name.trim(),
          unit: m.unit,
          rate: m.unit === 'tbd' ? undefined : num(m.rate) || 0,
          note: m.note?.trim() || undefined,
        })),
        equipment: form.equipment
          .filter((e) => e.name.trim() !== '')
          .map((e) => ({ id: e.id, name: e.name.trim(), rate: num(e.rate) || 0 })),
        logoUrl: form.logoUrl || '',
        brandColor: form.brandColor || '#1f6f45',
      })
    } finally {
      setSaving(false)
    }
  }

  const isLast = obStep === FORM_STEPS.length
  const canAdvance =
    obStep === 1
      ? form.crewMemberName.trim() !== ''
      : obStep === 2
        ? form.businessName.trim() !== '' && form.contactEmail.trim() !== ''
        : true

  const goBack = () => {
    if (obStep === 1 && onCancel) {
      onCancel()
      return
    }
    setObStep((s) => Math.max(onCancel ? 1 : 0, s - 1))
  }

  const goPrimary = () => {
    if (obStep === 0) {
      setObStep(1)
      return
    }
    if (isLast) {
      save()
      return
    }
    if (!canAdvance) return
    setObStep((s) => s + 1)
  }

  const primaryLabel =
    obStep === 0
      ? 'Get started'
      : isLast
        ? saving
          ? 'Saving...'
          : onCancel
            ? 'Save changes'
            : 'Start quoting'
        : 'Next'

  const backLabel = obStep === 1 && onCancel ? 'Cancel' : 'Back'

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <span className="mark">
              <img src={logoIcon} alt="" />
            </span>
            <span className="brand-text">
              AutoQuoteHM
              <small>{form.businessName || 'Quote Estimator'}</small>
            </span>
          </div>
          {onSignOut && (
            <button type="button" className="topbar-reset" onClick={onSignOut}>
              Sign Out
            </button>
          )}
        </div>

        {obStep > 0 && (
          <div className="progress">
            <div className="track">
              <div
                className="fill"
                style={{ width: `${((obStep - 1) / (FORM_STEPS.length - 1)) * 100}%` }}
              />
            </div>
            <div className="steps">
              {FORM_STEPS.map((label, i) => {
                const target = i + 1
                const clickable = onCancel || target < obStep
                return (
                  <button
                    key={label}
                    type="button"
                    className={`step ${target === obStep ? 'current' : ''} ${
                      target < obStep ? 'done' : ''
                    }`}
                    onClick={() => clickable && setObStep(target)}
                    disabled={!clickable}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </header>

      <main className="content">
        {obStep === 0 && (
          <div className="hero">
            <span className="hero-mark" aria-hidden="true">
              <img src={logoIcon} alt="" />
            </span>
            <h1>Welcome to AutoQuoteHM</h1>
            <p>
              Turn a site walk into an accurate, on-brand quote in minutes — right from
              your phone.
            </p>
            <ul className="hero-features">
              <li className="hero-feature">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Set your own materials, equipment and labor rates once — reuse them on
                  every job.
                </span>
              </li>
              <li className="hero-feature">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                <span>Quotes price themselves as your crew fills in the job on site.</span>
              </li>
              <li className="hero-feature">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                <span>Send a finished quote straight to your office with one tap.</span>
              </li>
            </ul>
          </div>
        )}

        {obStep === 1 && (
          <Section title="Sign In" hint="Who's using AutoQuoteHM on this device.">
            <Field label="Your name" required>
              <input
                value={form.crewMemberName}
                onChange={(e) => setField('crewMemberName')(e.target.value)}
                placeholder="Whoever's on-site today"
              />
            </Field>
            <div className="row">
              <Field label="Your email">
                <input
                  value={form.yourEmail}
                  onChange={(e) => setField('yourEmail')(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  type="email"
                  inputMode="email"
                />
              </Field>
              <Field label="Your phone">
                <input
                  value={form.yourPhone}
                  onChange={(e) => setField('yourPhone')(e.target.value)}
                  placeholder="(555) 123-4567"
                  type="tel"
                  inputMode="tel"
                />
              </Field>
            </div>
          </Section>
        )}

        {obStep === 2 && (
          <>
            <Section
              title="What you do"
              hint="Adds a starter set of services and equipment for that trade — edit or remove anything you don't need."
            >
              <div className="service-list">
                {INDUSTRIES.map((ind) => {
                  const on = form.industries.includes(ind.id)
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      className={`service ${on ? 'on' : ''}`}
                      onClick={() => toggleIndustry(ind.id)}
                      aria-pressed={on}
                    >
                      <span className="check" aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      <span className="service-text">
                        <strong>{ind.name}</strong>
                      </span>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Business" hint="The business these quotes go out under.">
              <Field label="Business name" required>
                <input
                  value={form.businessName}
                  onChange={(e) => setField('businessName')(e.target.value)}
                  placeholder="Riverside Landscaping"
                />
              </Field>
              <Field label="Business address">
                <input
                  value={form.shopAddress}
                  onChange={(e) => setField('shopAddress')(e.target.value)}
                  placeholder="142 Depot St, Littleton MA"
                />
              </Field>
            </Section>

            <Section title="Branding" hint="Shown on the PDF quotes you send customers.">
              <Field label="Logo">
                <div className="logo-row">
                  {form.logoUrl && <img src={form.logoUrl} alt="" className="logo-preview" />}
                  <label className="btn ghost logo-upload-btn">
                    {logoUploading ? 'Uploading...' : form.logoUrl ? 'Change logo' : 'Upload logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      disabled={logoUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleLogoFile(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                {logoError && <p className="auth-error">{logoError}</p>}
              </Field>
              <Field label="Brand color">
                <input
                  type="color"
                  className="color-input"
                  value={form.brandColor}
                  onChange={(e) => setField('brandColor')(e.target.value)}
                />
              </Field>
            </Section>

            <Section
              title="Quotes go to"
              hint="Who receives each completed quote by email."
            >
              <div className="row">
                <Field label="Contact name">
                  <input
                    value={form.contactName}
                    onChange={(e) => setField('contactName')(e.target.value)}
                    placeholder="Alex Rivera"
                  />
                </Field>
                <Field label="Contact phone">
                  <input
                    value={form.contactPhone}
                    onChange={(e) => setField('contactPhone')(e.target.value)}
                    placeholder="(555) 123-4567"
                    type="tel"
                    inputMode="tel"
                  />
                </Field>
              </div>
              <Field label="Contact email" required>
                <input
                  value={form.contactEmail}
                  onChange={(e) => setField('contactEmail')(e.target.value)}
                  placeholder="office@yourbusiness.com"
                  type="email"
                  inputMode="email"
                />
              </Field>
            </Section>
          </>
        )}

        {obStep === 3 && (
          <Section
            title="Materials & Pricing"
            hint="Every material or line-item service you quote, and what you charge for it."
          >
            <div className="edit-list">
              {form.materials.map((m, i) => (
                <div className="edit-row" key={m.id}>
                  <input
                    className="edit-name"
                    value={m.name}
                    onChange={(e) => updateMaterial(i, { name: e.target.value })}
                    placeholder="Material name"
                  />
                  <select
                    className="unit-select"
                    value={m.unit}
                    onChange={(e) => updateMaterial(i, { unit: e.target.value })}
                    aria-label={`Unit for ${m.name || 'material'}`}
                  >
                    <option value="yard">Cubic yards</option>
                    <option value="sqft">Square feet</option>
                    <option value="each">Each</option>
                    <option value="linear-ft">Linear feet</option>
                    <option value="tbd">TBD (priced separately)</option>
                  </select>
                  {m.unit !== 'tbd' && (
                    <NumInput
                      value={m.rate}
                      onChange={(v) => updateMaterial(i, { rate: v })}
                      placeholder="0"
                      suffix={`$/${UNIT_LABEL[m.unit]}`}
                    />
                  )}
                  <input
                    className="edit-note"
                    value={m.note ?? ''}
                    onChange={(e) => updateMaterial(i, { note: e.target.value })}
                    placeholder="Note (optional)"
                  />
                  <button
                    type="button"
                    className="edit-remove"
                    onClick={() => removeMaterial(i)}
                    aria-label={`Remove ${m.name || 'material'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost add-row" onClick={addMaterial}>
              + Add material
            </button>
          </Section>
        )}

        {obStep === 4 && (
          <Section title="Equipment" hint="Day-rate gear the crew uses on jobs.">
            <div className="edit-list">
              {form.equipment.map((e, i) => (
                <div className="edit-row" key={e.id}>
                  <input
                    className="edit-name"
                    value={e.name}
                    onChange={(ev) => updateEquipment(i, { name: ev.target.value })}
                    placeholder="Equipment name"
                  />
                  <NumInput
                    value={e.rate}
                    onChange={(v) => updateEquipment(i, { rate: v })}
                    placeholder="0"
                    suffix="$/day"
                  />
                  <button
                    type="button"
                    className="edit-remove"
                    onClick={() => removeEquipment(i)}
                    aria-label={`Remove ${e.name || 'equipment'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost add-row" onClick={addEquipment}>
              + Add equipment
            </button>
          </Section>
        )}

        {obStep === 5 && (
          <>
            <Section title="Labor">
              <Field label="Labor rate (per hour, per crew member)">
                <NumInput
                  value={form.laborRate}
                  onChange={setField('laborRate')}
                  placeholder="60"
                  suffix="$/hr"
                />
              </Field>
            </Section>

            <Section title="Travel & Fuel">
              <Field label="Mileage rate (round trip)">
                <NumInput
                  value={form.mileageRate}
                  onChange={setField('mileageRate')}
                  placeholder="0.75"
                  suffix="$/mi"
                />
              </Field>
            </Section>

            <Section title="Disposal">
              <Field label="Dump / transfer station fee">
                <NumInput
                  value={form.dumpFee}
                  onChange={setField('dumpFee')}
                  placeholder="65"
                  suffix="$/load"
                />
              </Field>
            </Section>
          </>
        )}

        {obStep === 6 && (
          <Section title="Margin & Minimums">
            <Field label="Default target margin">
              <div className="margin-row">
                <input
                  type="range"
                  min="10"
                  max="70"
                  step="1"
                  value={form.marginPct}
                  onChange={(e) => setField('marginPct')(e.target.value)}
                />
                <span className="margin-value">{form.marginPct}%</span>
              </div>
            </Field>
            <div className="row">
              <Field label="Minimum job charge">
                <NumInput
                  value={form.minJobCharge}
                  onChange={setField('minJobCharge')}
                  placeholder="250"
                  suffix="$"
                />
              </Field>
              <Field label="Trip / show-up minimum">
                <NumInput
                  value={form.tripMinimum}
                  onChange={setField('tripMinimum')}
                  placeholder="0"
                  suffix="$"
                />
              </Field>
            </div>
            <Field label="Sales tax on quotes (optional)">
              <NumInput
                value={form.salesTaxPct}
                onChange={setField('salesTaxPct')}
                placeholder="0"
                suffix="%"
              />
            </Field>
            <p className="subgroup-hint">
              Shows as its own line on the customer PDF, added on top of your quote price.
              Leave blank for no tax line.
            </p>
            <p className="subgroup-hint">
              Trip minimum is stored here but not yet applied automatically — say the word
              if you want a rule for when it kicks in.
            </p>

            {onReset && (
              <div className="danger-zone">
                {!confirmReset ? (
                  <button
                    type="button"
                    className="link-danger"
                    onClick={() => setConfirmReset(true)}
                  >
                    Delete all my data
                  </button>
                ) : (
                  <div className="danger-confirm">
                    <p>
                      This permanently deletes your business info, contacts, materials,
                      equipment and rates from AutoQuoteHM's servers, then signs you out.
                      This can't be undone.
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setConfirmReset(false)}
                      >
                        Cancel
                      </button>
                      <button type="button" className="btn danger" onClick={onReset}>
                        Yes, reset everything
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}
      </main>

      <footer className="footer">
        {obStep > 0 && (
          <button type="button" className="btn ghost" onClick={goBack}>
            {backLabel}
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={obStep > 0 && (isLast ? !canSave || saving : !canAdvance)}
          onClick={goPrimary}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
  )
}
