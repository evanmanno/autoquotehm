# VRS Landscape Services — Job Estimator

Mobile-first job estimator for on-site visits. Four steps: Property Info →
Services Needed → Job Details → Quote Summary, then emails the quote to the
office.

## Run it

```sh
npm install
npm start          # vite --host, so a phone on the same Wi-Fi can reach it
```

Open the **Network** URL printed in the terminal on the phone.

## Pricing

All rates live at the top of `src/pricing.js`.

| Service | Rate |
| --- | --- |
| Mulch Installation | $120 / yd³ |
| Sod Installation | $0.90 / sq ft |
| Lawn Grading & Leveling | $0.40 / sq ft |
| Loam / Topsoil | $120 / yd³ |
| Hydroseeding | $0.20 / sq ft |
| Gravel | $240 / yd³ |
| Labor | $60 / hour per crew member |
| Spring Cleanup, Junk Removal | TBD — excluded from the totals |

Total cost is summed first, then the quote is `cost / (1 - 0.52)` so **52% is
the true margin on the customer quote price**.

## EmailJS setup

The **Send to Martina** button emails the full estimate to
`vrslandscapeco@gmail.com` straight from the browser — no backend.

1. Create a free account at <https://emailjs.com>.
2. **Email Services** → add a service (e.g. connect the Gmail account) and copy
   the **Service ID**.
3. **Email Templates** → create a template and copy the **Template ID**.
   Configure it as:
   - **To email:** `{{to_email}}`
   - **Subject:** `{{subject}}`
   - **Content:** `{{message}}` — nothing else. The app sends the whole
     formatted body in that one variable, so keep the template plain text (or
     wrap it in `<pre>{{message}}</pre>` for an HTML template to preserve the
     column alignment).
4. **Account** → copy the **Public Key**.
5. `cp .env.example .env.local`, paste the three values in, and restart the
   server.

Other variables available to the template if you want to build a fancier
layout: `customer_name`, `customer_phone`, `property_address`, `crew`,
`total_cost`, `profit_amount`, `quote_price`.

Until the keys are set, the quote screen shows a warning banner and the send
button reports a configuration error rather than pretending to succeed.

## Notes

- Draft answers auto-save to `localStorage`, so a locked phone or an accidental
  refresh mid-visit doesn't lose the site data. Photos are not saved across a
  reload, and they are **not attached** to the email — the body just records how
  many were taken.
- `src/emailBody.js` builds the plain-text email and has no browser
  dependencies, so it can be run and inspected from Node.
