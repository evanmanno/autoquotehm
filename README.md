# AutoQuoteHM

Mobile-first job-quoting tool for landscaping and home-service contractors.
A crew member fills in a job on-site — Property Info → Services → Job
Details → Quote Summary — and the app prices it live off that business's own
rates, then emails the finished quote straight to the office. No backend;
everything lives in the browser.

## Run it locally

```sh
npm install
npm start          # vite --host, so a phone on the same Wi-Fi can reach it
```

Open the **Network** URL printed in the terminal on the phone.

## First run

New installs land on a Welcome screen, then a short onboarding funnel: Sign
In → Business → Materials & Pricing → Equipment → Rates → Margins. Everything
entered there — business name, contact email, materials, equipment, labor
rate, target margin — is per-install and drives every quote afterward.

While testing, a **Reset** button in the top bar (and a "Reset all data" link
at the bottom of the Margins step) clears everything and drops you back to
Welcome, so you can run through onboarding again without clearing browser
storage by hand.

## Pricing model

All rates are entered per-business during onboarding (Company Settings), not
hardcoded. The math, in `src/pricing.js`:

```
cost = materials + (hours × crew × laborRate) + equipment
     + (miles × 2 × mileageRate) + fuel + (loads × dumpFee)

quotePrice = cost / (1 - margin)
```

Cost is totalled first, then marked up so the target margin is the true
margin on the **customer-facing price**, not just a markup on cost. If that
price falls under the business's minimum job charge, the app raises it
automatically and flags it on the quote.

## EmailJS setup

The **Send** button on the quote screen emails the full estimate to whatever
address is set as "Contact email" in that business's Company Settings — no
backend involved.

1. Create a free account at <https://emailjs.com>.
2. **Email Services** → add a service (e.g. connect a Gmail account) and copy
   the **Service ID**.
3. **Email Templates** → create a template configured as:
   - **To email:** `{{to_email}}`
   - **Reply to:** `{{reply_to}}`
   - **Subject:** `{{subject}}`
   - **Content:** `{{message}}` — nothing else. The app sends the whole
     formatted body in that one variable, so keep the template plain text (or
     wrap it in `<pre>{{message}}</pre>` for an HTML template to preserve the
     column alignment).
4. **Account** → copy the **Public Key**.
5. `cp .env.example .env.local`, paste the three values in, and restart the
   dev server (or set the same three as environment variables in your
   hosting provider for a deployed build).

Until the keys are set, the quote screen shows a warning banner and the send
button reports a configuration error rather than pretending to succeed.

## Deploying

This is a static Vite build — any static host works. Fastest path:

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com) (or [netlify.com](https://netlify.com)),
   **New Project → Import** this repo. Both auto-detect Vite — build command
   `npm run build`, output directory `dist`.
3. Add the three `VITE_EMAILJS_*` variables from `.env.local` as environment
   variables in the hosting provider's dashboard before the first deploy.
4. Every push to `main` after that redeploys automatically.

## Notes

- Draft answers and company settings auto-save to `localStorage`, so a locked
  phone or an accidental refresh mid-visit doesn't lose the site data. Photos
  are not saved across a reload, and they are **not attached** to the email —
  the body just records how many were taken.
- `src/emailBody.js` builds the plain-text email and has no browser
  dependencies, so it can be run and inspected from Node.
- Each install is single-business/single-device right now (everything lives
  in that browser's `localStorage`). Multiple businesses currently means
  multiple installs, not multiple accounts in one shared instance.
