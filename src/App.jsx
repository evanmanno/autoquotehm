import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES,
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
  categoryOf,
  equipmentById,
  estimate,
  makeId,
  money,
  num,
  qty,
  seedFlags,
} from './pricing'
import { isConfigured, sendQuote } from './email'
import logoIcon from './assets/logo-icon.png'
import { getInitialSession, onAuthChange, signIn, signOut, signUp } from './lib/auth'
import { deleteCompany, fetchCompany, saveCompany, uploadLogo } from './lib/companyStore'
import { buildQuotePdf } from './lib/quotePdf'
import {
  acceptPendingInvite,
  captureInviteFromUrl,
  clearPendingInvite,
  fetchMyMember,
  getPendingInvite,
  saveQuote,
} from './lib/teamStore'
import { SavedQuotes, Team } from './Team'
import { SettingsHub, SettingsPage } from './Settings'
import { ConceptCard } from './Concept'
import './team.css'
import './settings.css'

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
  const [svcTab, setSvcTab] = useState('')
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
  const [view, setView] = useState('new') // new | quotes | settings
  const [settingsPage, setSettingsPage] = useState(null) // null (the list) | 'team'
  const [editStep, setEditStep] = useState(1)
  const [me, setMe] = useState(null) // this login's row in the company's team
  const [savedQuoteId, setSavedQuoteId] = useState(null)
  const [conceptUrl, setConceptUrl] = useState(null) // AI concept chosen for the PDF
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [hasInvite] = useState(captureInviteFromUrl)
  const [inviteError, setInviteError] = useState('')
  const [inviteJoined, setInviteJoined] = useState(false)
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
  // whenever the logged-in account changes. If the person arrived through an
  // invite link, join that company first so they land on its data instead of
  // an empty onboarding screen.
  useEffect(() => {
    if (!session) {
      setCompany(null)
      setMe(null)
      setCompanyLoading(false)
      return
    }
    let active = true
    setCompanyLoading(true)
    ;(async () => {
      if (getPendingInvite()) {
        const res = await acceptPendingInvite()
        if (active) {
          if (res.ok) setInviteJoined(res.joined)
          else setInviteError(res.message)
        }
      }
      const c = await fetchCompany()
      if (!active) return
      setCompany(c)
      if (c) {
        try {
          const m = await fetchMyMember(session.user.id)
          if (active) setMe(m)
        } catch (err) {
          console.error('Failed to load team membership:', err)
        }
      }
    })()
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

  const materials = useMemo(
    () => (company?.materials ?? []).map((m) => ({ ...seedFlags(m.id), ...m })),
    [company],
  )
  const equipmentList = company?.equipment ?? []
  const selected = materials.filter((s) => job.services.includes(s.id))
  const yardServices = selected.filter((s) => s.unit === 'yard')
  const sqftServices = selected.filter((s) => s.unit === 'sqft')
  const eachServices = selected.filter((s) => s.unit === 'each')
  const linearFtServices = selected.filter((s) => s.unit === 'linear-ft')
  const hasSnowServices = selected.some((s) => s.perVisit || s.depthScaled)

  // Services step tabs: one per category that actually has services.
  const serviceTabs = CATEGORIES.map((c) => ({
    ...c,
    items: materials.filter((m) => categoryOf(m) === c.id),
  })).filter((c) => c.items.length > 0)
  const activeTab = serviceTabs.find((t) => t.id === svcTab) ?? serviceTabs[0]

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

  // Owner is whoever created the company; everyone else is an estimator.
  const isOwner = Boolean(company) && (company.ownerId == null || company.ownerId === session?.user?.id)

  // "Prepared by" follows the person using the app, not the company owner.
  const preparer = {
    name: me?.displayName || (isOwner ? company?.crewMemberName : '') || '',
    phone: me?.phone || (isOwner ? company?.yourPhone : '') || '',
    email: me?.email || (isOwner ? company?.yourEmail : '') || session?.user?.email || '',
  }
  const companyForQuote = company
    ? {
        ...company,
        crewMemberName: preparer.name,
        yourPhone: preparer.phone,
        yourEmail: preparer.email,
      }
    : company

  // Saves (or updates) this job in the company's shared quote list. Passing a
  // status sets it; leaving it out keeps whatever the quote is already marked.
  const persistQuote = async (status) => {
    if (!company?.id) return
    setSaveState('saving')
    try {
      const row = await saveQuote({
        id: savedQuoteId,
        companyId: company.id,
        job,
        est,
        status,
        createdByName: preparer.name || preparer.email,
      })
      setSavedQuoteId(row.id)
      setSaveState('saved')
    } catch (err) {
      console.error('Saving quote failed:', err)
      setSaveState('error')
    }
  }

  // Every quote is saved automatically the moment it reaches the Quote step.
  useEffect(() => {
    if (step === 3 && view === 'new') persistQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, view])

  const openSavedQuote = (q) => {
    if (!q.job) {
      alert('This quote was saved before reopening was supported.')
      return
    }
    setJob({ ...emptyJob, ...q.job })
    setSavedQuoteId(q.id)
    setSaveState('saved')
    setSendState('idle')
    setSendError('')
    setView('new')
    setStep(3)
  }

  const sendToOffice = async () => {
    setSendState('sending')
    setSendError('')
    try {
      await sendQuote(job, est, photos.length, companyForQuote)
      setSendState('sent')
      persistQuote('sent')
    } catch (err) {
      setSendError(err?.text || err?.message || 'Email failed to send.')
      setSendState('error')
    }
  }

  const downloadPdf = async () => {
    setPdfState('generating')
    try {
      await buildQuotePdf(job, est, company, { conceptUrl })
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
    setConceptUrl(null)
    setJob(emptyJob)
    setSavedQuoteId(null)
    setSaveState('idle')
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
    setSavedQuoteId(null)
    setSaveState('idle')
    setSendState('idle')
    setSendError('')
    setStep(0)
    setView('new')
    setMe(null)
    setInviteError('')
    setInviteJoined(false)
    setEditingCompany(false)
    setOnboardingKey((k) => k + 1)
  }

  const openEditor = (startAt) => {
    setEditStep(startAt)
    setOnboardingKey((k) => k + 1)
    setEditingCompany(true)
  }

  const quickSignOut = () => {
    if (window.confirm('Sign out of Pricr on this device?')) {
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
    return <Login invited={hasInvite} />
  }

  // They followed an invite link but it couldn't be used (wrong email, used,
  // expired). Say so plainly instead of dropping them into onboarding.
  if (inviteError && !company) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand">
              <span className="mark">
                <img src={logoIcon} alt="" />
              </span>
              <span className="brand-text">Pricr</span>
            </div>
          </div>
        </header>
        <main className="content">
          <section className="card">
            <header className="card-head">
              <h2>That invite didn't work</h2>
              <p>{inviteError}</p>
            </header>
            <p className="subgroup-hint">
              Signed in as {session.user.email}. If this is the wrong account, sign out and
              use the email your admin invited.
            </p>
          </section>
          <footer className="footer footer--stacked">
            <button type="button" className="btn primary" onClick={signOutNow}>
              Sign out
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                clearPendingInvite()
                setInviteError('')
              }}
            >
              Set up my own business instead
            </button>
          </footer>
        </main>
      </div>
    )
  }

  if (!company || (editingCompany && isOwner)) {
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
        startStep={editStep}
        onReset={company ? deleteAllData : undefined}
        onSignOut={quickSignOut}
        ownerId={session?.user?.id}
      />
    )
  }

  return (
    <div className="app has-tabbar">
      <header className="topbar" ref={topRef}>
        <div className="topbar-row">
          <div className="brand">
            <span className="mark">
              <img src={logoIcon} alt="" />
            </span>
            <span className="brand-text">
              Pricr
              <small>{company.businessName || 'Quote Estimator'}</small>
            </span>
          </div>
        </div>

        {view === 'new' && (
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
        )}
      </header>

      <main className="content">
        {view === 'quotes' && (
          <SavedQuotes
            companyId={company.id}
            isOwner={isOwner}
            userId={session.user.id}
            onOpen={openSavedQuote}
          />
        )}
        {view === 'settings' && settingsPage === null && (
          <SettingsHub
            company={company}
            me={me}
            isOwner={isOwner}
            email={session.user.email}
            onEdit={openEditor}
            onOpenTeam={() => setSettingsPage('team')}
            onSignOut={quickSignOut}
            onDeleteAll={deleteAllData}
          />
        )}
        {view === 'settings' && settingsPage === 'team' && (
          <SettingsPage title={isOwner ? 'Team & invites' : 'Your team'} onBack={() => setSettingsPage(null)}>
            <Team
              company={company}
              isOwner={isOwner}
              me={me}
              userId={session.user.id}
              onProfileSaved={(p) => setMe((m) => (m ? { ...m, ...p } : m))}
            />
          </SettingsPage>
        )}
        {view === 'new' && inviteJoined && (
          <p className="banner warn invite-banner">
            You joined {company.businessName || 'the team'}. Quotes use the company's prices.
          </p>
        )}
        {view === 'new' && step === 0 && (
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

        {view === 'new' && step === 1 && (
          <Section
            title="Services Needed"
            hint="Tap everything this job covers. You can change it later."
          >
            {serviceTabs.length > 1 && (
              <div className="cat-tabs" role="tablist">
                {serviceTabs.map((tab) => {
                  const picked = tab.items.filter((s) => job.services.includes(s.id)).length
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab?.id === tab.id}
                      className={`cat-tab ${activeTab?.id === tab.id ? 'on' : ''}`}
                      onClick={() => setSvcTab(tab.id)}
                    >
                      {tab.name}
                      {picked > 0 && <span className="cat-count">{picked}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="service-list">
              {(activeTab?.items ?? []).map((service) => {
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

        {view === 'new' && step === 2 && (
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

        {view === 'new' && step === 3 && (
          <Quote
            job={job}
            est={est}
            company={company}
            photoCount={photos.length}
            photos={photos}
            companyId={company?.id}
            quoteId={savedQuoteId}
            conceptUrl={conceptUrl}
            onPickConcept={setConceptUrl}
            sendState={sendState}
            sendError={sendError}
            onSend={sendToOffice}
            onNew={startNew}
            onBack={() => setStep(2)}
            pdfState={pdfState}
            onDownloadPdf={downloadPdf}
            saveState={saveState}
          />
        )}
      </main>

      {view === 'new' && step < STEPS.length - 1 && (
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

      <nav className="tabbar" aria-label="Sections">
        {[
          ['new', 'New quote', 'M12 5v14M5 12h14'],
          ['quotes', 'Quotes', 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
          [
            'settings',
            'Settings',
            'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
          ],
        ].map(([id, label, path]) => (
          <button
            key={id}
            type="button"
            className={view === id ? 'on' : ''}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => {
              setView(id)
              if (id === 'settings') setSettingsPage(null)
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={path} />
            </svg>
            {label}
          </button>
        ))}
      </nav>
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
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
  photos = [],
  companyId,
  quoteId,
  conceptUrl,
  onPickConcept,
  sendState,
  sendError,
  onSend,
  onNew,
  onBack,
  pdfState,
  onDownloadPdf,
  saveState,
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

      <ConceptCard
        job={job}
        est={est}
        photos={photos}
        companyId={companyId}
        quoteId={quoteId}
        selected={conceptUrl}
        onPick={onPickConcept}
      />

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

      {saveState === 'saved' && (
        <p className="saved-note">Saved to your company's quotes</p>
      )}
      {saveState === 'error' && (
        <p className="banner error">
          This quote couldn't be saved to your company's list. It will retry when you come
          back to this screen. You can still send it or download the PDF.
        </p>
      )}

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
// First run walks through Welcome → Sign In → Business → Services → Pricing →
// Equipment → Rates → Margins in order. Reopening from the profile pill
// (onCancel is set) jumps straight to Sign In and lets you move between any
// of the settings tabs freely, since there's no funnel to protect there.
// ---------------------------------------------------------------------------

const FORM_STEPS = ['Sign In', 'Business', 'Services', 'Pricing', 'Equipment', 'Rates', 'Margins']

function Login({ invited }) {
  const [mode, setMode] = useState(invited ? 'signup' : 'signin') // signin | signup
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
              <span className="brand-text">Pricr</span>
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
            <span className="brand-text">Pricr</span>
          </div>
        </div>
      </header>
      <main className="content">
        <div className="hero">
          <span className="hero-mark" aria-hidden="true">
            <img src={logoIcon} alt="" />
          </span>
          <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          {invited && (
            <p className="banner warn invite-banner">
              You've been invited to join a team. Create your account (or sign in) with the
              email address you were invited at.
            </p>
          )}
          <p>
            {mode === 'signup'
              ? "One login for your whole business \u2014 use it on any device."
              : 'Sign in to your Pricr account.'}
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

function Onboarding({ initial, onSave, onCancel, onReset, onSignOut, ownerId, startStep = 1 }) {
  const [obStep, setObStep] = useState(onCancel ? startStep : 0)
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
        // Keep anything another checked trade also uses (Landscaping and
        // Hardscaping share the hardscape starters).
        f.industries
          .filter((i) => i !== id)
          .forEach((i) => {
            ;(INDUSTRY_SERVICES[i] ?? []).forEach((s) => serviceIds.delete(s.id))
            ;(INDUSTRY_EQUIPMENT[i] ?? []).forEach((e) => equipmentIds.delete(e.id))
          })
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

  // Adds any starter service for a checked trade that isn't in the list yet
  // (e.g. services added in an app update). Never changes or removes anything.
  const addMissingStarters = () =>
    setForm((f) => {
      const have = new Set(f.materials.map((m) => m.id))
      const adds = f.industries
        .flatMap((id) => INDUSTRY_SERVICES[id] ?? [])
        .filter((s) => !have.has(s.id))
        .map((s) => ({ ...s, rate: String(s.rate ?? '') }))
      return adds.length ? { ...f, materials: [...f.materials, ...adds] } : f
    })

  const updateMaterial = (index, patch) =>
    setForm((f) => ({
      ...f,
      materials: f.materials.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }))

  const [focusId, setFocusId] = useState(null)
  const addMaterial = (category = 'other') => {
    const id = makeId()
    setFocusId(id)
    setForm((f) => ({
      ...f,
      materials: [...f.materials, { id, name: '', unit: 'yard', rate: '', note: '', category }],
    }))
  }

  const [newService, setNewService] = useState({ name: '', category: 'maintenance' })

  // Adds a service by name only (priced "TBD" until a rate is set under Pricing).
  const addService = () => {
    const name = newService.name.trim()
    if (!name) return
    setForm((f) => ({
      ...f,
      materials: [
        ...f.materials,
        { id: makeId(), name, unit: 'tbd', rate: '', note: '', category: newService.category },
      ],
    }))
    setNewService((s) => ({ ...s, name: '' }))
  }

  const removeMaterial = (index) =>
    setForm((f) => ({ ...f, materials: f.materials.filter((_, i) => i !== index) }))

  const updateEquipment = (index, patch) =>
    setForm((f) => ({
      ...f,
      equipment: f.equipment.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }))

  const addEquipment = () => {
    const id = makeId()
    setFocusId(id)
    setForm((f) => ({
      ...f,
      equipment: [...f.equipment, { id, name: '', rate: '' }],
    }))
  }

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
          category: m.category || undefined,
          perVisit: m.perVisit || seedFlags(m.id).perVisit || undefined,
          depthScaled: m.depthScaled || seedFlags(m.id).depthScaled || undefined,
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
              Pricr
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
            <h1>Welcome to Pricr</h1>
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
          <Section title="Sign In" hint="Who's using Pricr on this device.">
            <Field label="Your name" required>
              <input
                value={form.crewMemberName}
                onChange={(e) => setField('crewMemberName')(e.target.value)}
                placeholder="Whoever's on-site today"
              />
            </Field>
            <>
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
            </>
          </Section>
        )}

        {obStep === 2 && (
          <>
            <Section
              title="What you do"
              hint="Pick your trades. We add starter services and equipment you can edit later."
            >
              <div className="chip-grid">
                {INDUSTRIES.map((ind) => {
                  const on = form.industries.includes(ind.id)
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      className={`chip ${on ? 'on' : ''}`}
                      onClick={() => toggleIndustry(ind.id)}
                      aria-pressed={on}
                    >
                      <span className="chip-check" aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      {ind.name}
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Business & branding" hint="Shown at the top of every quote you send.">
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
              <div className="brand-row">
                <div className="field">
                  <span className="label">Logo</span>
                  <div className="logo-row">
                    {form.logoUrl && <img src={form.logoUrl} alt="" className="logo-preview" />}
                    <label className="btn ghost logo-upload-btn">
                      {logoUploading ? 'Uploading...' : form.logoUrl ? 'Change' : 'Upload'}
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
                </div>
                <label className="field">
                  <span className="label">Brand color</span>
                  <span className="color-chip">
                    <input
                      type="color"
                      className="color-input"
                      value={form.brandColor}
                      onChange={(e) => setField('brandColor')(e.target.value)}
                    />
                    <span className="color-hex">{String(form.brandColor || '').toUpperCase()}</span>
                  </span>
                </label>
              </div>
              {logoError && <p className="auth-error">{logoError}</p>}
            </Section>

            <Section title="Send quotes to" hint="Who gets each completed quote by email.">
              <Field label="Contact email" required>
                <input
                  value={form.contactEmail}
                  onChange={(e) => setField('contactEmail')(e.target.value)}
                  placeholder="office@yourbusiness.com"
                  type="email"
                  inputMode="email"
                />
              </Field>
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
            </Section>
          </>
        )}

        {obStep === 3 && (
          <Section
            title="Services you offer"
            hint="Type every service your company provides. They show up as tabs when you build a quote. Set what you charge for each one under Pricing."
          >
            <form
              className="svc-add"
              onSubmit={(e) => {
                e.preventDefault()
                addService()
              }}
            >
              <input
                value={newService.name}
                onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))}
                type="text"
                placeholder="e.g. Brush clearing"
                aria-label="New service name"
              />
              <button type="submit" className="btn primary svc-add-btn" disabled={!newService.name.trim()}>
                Add
              </button>
              <select
                className="unit-select"
                value={newService.category}
                onChange={(e) => setNewService((s) => ({ ...s, category: e.target.value }))}
                aria-label="Which tab"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </form>

            {CATEGORIES.map((cat) => {
              const rows = form.materials
                .map((m, index) => ({ m, index }))
                .filter(({ m }) => categoryOf(m) === cat.id)
              if (rows.length === 0) return null
              return (
                <div className="group" key={cat.id}>
                  <h3 className="group-title">
                    {cat.name} <span className="svc-count">{rows.length}</span>
                  </h3>
                  <div className="edit-list">
                    {rows.map(({ m, index }) => (
                      <div className="svc-row" key={m.id}>
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) => updateMaterial(index, { name: e.target.value })}
                          placeholder="Service name"
                          aria-label="Service name"
                        />
                        <select
                          className="unit-select svc-move"
                          value={categoryOf(m)}
                          onChange={(e) => updateMaterial(index, { category: e.target.value })}
                          aria-label={`Tab for ${m.name || 'service'}`}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="edit-remove"
                          onClick={() => removeMaterial(index)}
                          aria-label={`Remove ${m.name || 'service'}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <p className="subgroup-hint">
              A service with no price yet shows as "Priced separately — TBD" on a quote until
              you set a rate under Pricing.
            </p>
          </Section>
        )}

        {obStep === 4 && (
          <Section
            title="Materials & Pricing"
            hint="What you charge for each service. Pick the unit, set the rate, and add a note if it helps."
          >
            {CATEGORIES.map((cat) => {
              const rows = form.materials
                .map((m, index) => ({ m, index }))
                .filter(({ m }) => categoryOf(m) === cat.id)
              if (rows.length === 0) return null
              return (
                <div className="group" key={cat.id}>
                  <h3 className="group-title">
                    {cat.name} <span className="svc-count">{rows.length}</span>
                  </h3>
                  <div className="edit-list">
                    {rows.map(({ m, index: i }) => (
                      <div className="price-row" key={m.id}>
                        <input
                          type="text"
                          className="pr-name"
                          value={m.name}
                          autoFocus={m.id === focusId}
                          onChange={(e) => updateMaterial(i, { name: e.target.value })}
                          placeholder="Service or material name"
                          aria-label="Name"
                        />
                        <button
                          type="button"
                          className="edit-remove"
                          onClick={() => removeMaterial(i)}
                          aria-label={`Remove ${m.name || 'item'}`}
                        >
                          <TrashIcon />
                        </button>
                        <div className="pr-controls">
                          <select
                            className="unit-select"
                            value={m.unit}
                            onChange={(e) => updateMaterial(i, { unit: e.target.value })}
                            aria-label={`Unit for ${m.name || 'item'}`}
                          >
                            <option value="yard">Cubic yards</option>
                            <option value="sqft">Square feet</option>
                            <option value="each">Each</option>
                            <option value="linear-ft">Linear feet</option>
                            <option value="tbd">TBD (priced separately)</option>
                          </select>
                          {m.unit !== 'tbd' ? (
                            <NumInput
                              value={m.rate}
                              onChange={(v) => updateMaterial(i, { rate: v })}
                              placeholder="0"
                              suffix={`$/${UNIT_LABEL[m.unit]}`}
                            />
                          ) : (
                            <span className="pr-tbd">Priced on each quote</span>
                          )}
                        </div>
                        <input
                          type="text"
                          className="pr-note"
                          value={m.note ?? ''}
                          onChange={(e) => updateMaterial(i, { note: e.target.value })}
                          placeholder="Add a note (optional)"
                          aria-label="Note"
                        />
                      </div>
                    ))}
                  </div>
                  <button type="button" className="add-row" onClick={() => addMaterial(cat.id)}>
                    + Add to {cat.name}
                  </button>
                </div>
              )
            })}
            <div className="list-actions">
              <button type="button" className="link-btn" onClick={() => addMaterial('other')}>
                + Add something else
              </button>
              <button type="button" className="link-btn" onClick={addMissingStarters}>
                + Add missing starter services
              </button>
            </div>
          </Section>
        )}

        {obStep === 5 && (
          <Section title="Equipment" hint="Day-rate gear the crew uses on jobs.">
            <div className="edit-list">
              {form.equipment.map((e, i) => (
                <div className="price-row" key={e.id}>
                  <input
                    type="text"
                    className="pr-name"
                    value={e.name}
                    autoFocus={e.id === focusId}
                    onChange={(ev) => updateEquipment(i, { name: ev.target.value })}
                    placeholder="Equipment name"
                    aria-label="Name"
                  />
                  <button
                    type="button"
                    className="edit-remove"
                    onClick={() => removeEquipment(i)}
                    aria-label={`Remove ${e.name || 'equipment'}`}
                  >
                    <TrashIcon />
                  </button>
                  <div className="pr-controls one">
                    <NumInput
                      value={e.rate}
                      onChange={(v) => updateEquipment(i, { rate: v })}
                      placeholder="0"
                      suffix="$/day"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="add-row" onClick={addEquipment}>
              + Add equipment
            </button>
          </Section>
        )}

        {obStep === 6 && (
          <Section title="Labor, travel & disposal" hint="What you charge for time, driving and dump runs.">
            <div className="set-rows">
              <div className="set-row">
                <div className="set-text">
                  <strong>Labor rate</strong>
                  <small>Per hour, per crew member</small>
                </div>
                <NumInput
                  value={form.laborRate}
                  onChange={setField('laborRate')}
                  placeholder="60"
                  suffix="$/hr"
                />
              </div>
              <div className="set-row">
                <div className="set-text">
                  <strong>Mileage rate</strong>
                  <small>Round trip to the job</small>
                </div>
                <NumInput
                  value={form.mileageRate}
                  onChange={setField('mileageRate')}
                  placeholder="0.75"
                  suffix="$/mi"
                />
              </div>
              <div className="set-row">
                <div className="set-text">
                  <strong>Dump fee</strong>
                  <small>Transfer station, per load</small>
                </div>
                <NumInput
                  value={form.dumpFee}
                  onChange={setField('dumpFee')}
                  placeholder="65"
                  suffix="$/load"
                />
              </div>
            </div>
          </Section>
        )}

        {obStep === 7 && (
          <Section title="Margins, minimums & tax" hint="How your prices are built from your costs.">
            <div className="margin-card">
              <div className="set-text">
                <strong>Target margin</strong>
                <small>Profit built into every quote</small>
              </div>
              <div className="margin-row">
                <input
                  type="range"
                  min="10"
                  max="70"
                  step="1"
                  value={form.marginPct}
                  onChange={(e) => setField('marginPct')(e.target.value)}
                  aria-label="Target margin"
                />
                <span className="margin-value">{form.marginPct}%</span>
              </div>
            </div>
            <div className="set-rows">
              <div className="set-row">
                <div className="set-text">
                  <strong>Minimum job charge</strong>
                  <small>Smallest quote you'll send</small>
                </div>
                <NumInput
                  value={form.minJobCharge}
                  onChange={setField('minJobCharge')}
                  placeholder="250"
                  suffix="$"
                />
              </div>
              <div className="set-row">
                <div className="set-text">
                  <strong>Trip minimum</strong>
                  <small>Saved for reference, not applied to quotes yet</small>
                </div>
                <NumInput
                  value={form.tripMinimum}
                  onChange={setField('tripMinimum')}
                  placeholder="0"
                  suffix="$"
                />
              </div>
              <div className="set-row">
                <div className="set-text">
                  <strong>Sales tax</strong>
                  <small>Optional. Shows as its own line on the PDF</small>
                </div>
                <NumInput
                  value={form.salesTaxPct}
                  onChange={setField('salesTaxPct')}
                  placeholder="0"
                  suffix="%"
                />
              </div>
            </div>

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
                      equipment and rates from Pricr's servers, then signs you out.
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
