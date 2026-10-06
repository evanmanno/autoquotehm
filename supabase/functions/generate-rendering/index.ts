// Supabase Edge Function: generate-rendering
//
// Takes a customer photo + a prompt built from the quote and returns concept
// images of the finished project. Your image API key stays here (a Supabase
// secret) and is never shipped to the browser.
//
// Deploy:   supabase functions deploy generate-rendering
// Secrets:  supabase secrets set OPENAI_API_KEY=sk-...
//           (optional) IMAGE_MODEL=gpt-image-2   RENDER_MONTHLY_LIMIT=30
//
// Request (POST, JSON, user must be signed in):
//   { companyId, quoteId?, prompt, imageBase64? (jpeg, no data: prefix; omit for a no-photo concept), n? (1-2) }
// Response: { id, images: [signedUrl, ...], remaining }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('IMAGE_MODEL') ?? 'gpt-image-2'
  const monthlyLimit = Number(Deno.env.get('RENDER_MONTHLY_LIMIT') ?? '30')
  if (!openaiKey) return json({ error: 'Image generation is not configured yet.' }, 500)

  // 1. Who is calling? (the user's own JWT, so RLS decides what they can see)
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'Sign in first.' }, 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  const { companyId, quoteId, prompt, imageBase64 } = body ?? {}
  const n = Math.min(Math.max(Number(body?.n ?? 2), 1), 2)
  if (!companyId || !prompt) return json({ error: 'Missing prompt.' }, 400)
  if (imageBase64 && String(imageBase64).length > 8_000_000) return json({ error: 'Photo is too large.' }, 413)

  // 2. Are they on this company's team?
  const { data: member } = await userClient
    .from('members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return json({ error: 'Not allowed.' }, 403)

  // 3. Monthly allowance (each image counts as one credit).
  const admin = createClient(url, service)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: used } = await admin
    .from('renderings')
    .select('image_paths')
    .eq('company_id', companyId)
    .eq('status', 'done')
    .gte('created_at', monthStart.toISOString())
  const usedCount = (used ?? []).reduce((s: number, r: any) => s + (r.image_paths?.length ?? 0), 0)
  if (usedCount + n > monthlyLimit) {
    return json(
      { error: `You've used your ${monthlyLimit} concept images for this month.`, remaining: Math.max(monthlyLimit - usedCount, 0) },
      429,
    )
  }

  // 4. Ask the image model: edit the real photo, or (no photo) generate fresh.
  let ai: Response
  if (imageBase64) {
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt)
    form.append('n', String(n))
    form.append('quality', 'medium')
    form.append('size', 'auto')
    form.append('image', new Blob([b64ToBytes(imageBase64)], { type: 'image/jpeg' }), 'site.jpg')
    ai = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    })
  } else {
    ai = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n, quality: 'medium', size: '1536x1024' }),
    })
  }
  if (!ai.ok) {
    const text = await ai.text()
    console.error('image provider error', ai.status, text)
    await admin.from('renderings').insert({
      company_id: companyId, quote_id: quoteId ?? null, prompt, status: 'failed',
      error: text.slice(0, 500), created_by: user.id,
    })
    return json({ error: 'The image service could not make a concept right now. Try again.' }, 502)
  }
  const result = await ai.json()
  const images: string[] = (result.data ?? []).map((d: any) => d.b64_json).filter(Boolean)
  if (!images.length) return json({ error: 'No image came back. Try again.' }, 502)

  // 5. Save to private storage + log the request.
  const renderingId = crypto.randomUUID()
  const paths: string[] = []
  for (let i = 0; i < images.length; i++) {
    const path = `${companyId}/${renderingId}-${i + 1}.png`
    const { error } = await admin.storage
      .from('renderings')
      .upload(path, b64ToBytes(images[i]), { contentType: 'image/png' })
    if (error) {
      console.error('upload failed', error)
      return json({ error: 'Could not save the images.' }, 500)
    }
    paths.push(path)
  }
  await admin.from('renderings').insert({
    id: renderingId, company_id: companyId, quote_id: quoteId ?? null, prompt,
    status: 'done', image_paths: paths, created_by: user.id,
  })

  const signed = await Promise.all(
    paths.map(async (p) => (await admin.storage.from('renderings').createSignedUrl(p, 60 * 60)).data?.signedUrl),
  )
  return json({
    id: renderingId,
    images: signed.filter(Boolean),
    remaining: Math.max(monthlyLimit - usedCount - images.length, 0),
  })
})
