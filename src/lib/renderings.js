// Concept renderings: build the prompt from the quote, shrink the photo, call
// the generate-rendering Edge Function, and read past renderings back.
import { supabase } from './supabaseClient'


const qtyText = (item) => {
  const q = Math.round(Number(item.baseQuantity ?? item.quantity) * 10) / 10
  const unit = (item.unitLabel || '').replace(/^per /, '')
  return q > 0 && unit ? `${q} ${unit}` : ''
}

// Builds the text prompt ONLY from what is actually on the quote, so the
// picture can't promise work the customer isn't paying for.
export function buildRenderPrompt(job, est, extra = '', noPhoto = false) {
  const items = (est?.lineItems ?? []).filter((i) => !i.tbd)
  const lines = items.map((i) => {
    const q = qtyText(i)
    return `- ${i.baseName || i.name}${q ? ` (${q})` : ''}`
  })
  const hasWork = lines.length > 0
  return [
    noPhoto
      ? 'Create a photorealistic image of a typical residential property in a New England suburb, showing how it looks once the following work is completed.'
      : 'Edit this photo of a real property to show how it will look once the following work is completed.',
    hasWork ? 'Work included in the quote:\n' + lines.join('\n') : 'Show a clean, well-kept version of the property.',
    job?.notes ? `Customer / crew notes: ${job.notes}` : '',
    extra ? `Extra direction: ${extra}` : '',
    noPhoto
      ? 'Rules: natural daylight, eye-level view of the work area, realistic materials and plant sizes as a professional installation would look. Do not add features that are not listed. No text, logos or watermarks. Photorealistic.'
      : 'Rules: keep the existing house, driveway, trees, fences, camera angle, lighting and proportions exactly as in the photo. Only change the areas the work affects. Use realistic, natural materials and plant sizes for the work above, as a professional installation would look. Do not add features that are not listed. No text, logos or watermarks. Photorealistic.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// Resizes a photo (blob/object URL) to max 1280px JPEG and returns raw base64.
export async function photoToBase64(url, maxSide = 1280) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not read that photo.'))
    el.src = url
  })
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export async function generateConcept({ companyId, quoteId, prompt, imageBase64, n = 2 }) {
  const { data, error } = await supabase.functions.invoke('generate-rendering', {
    body: { companyId, quoteId: quoteId ?? null, prompt, imageBase64, n },
  })
  if (error) {
    // supabase-js hides the JSON body of non-2xx responses in error.context
    let msg = ''
    try {
      msg = (await error.context.json()).error
    } catch {
      /* ignore */
    }
    throw new Error(msg || 'Could not generate a concept. Try again.')
  }
  if (data?.error) throw new Error(data.error)
  return data // { id, images: [url], remaining }
}

// Past renderings for a quote, with fresh signed URLs.
export async function listRenderings(quoteId) {
  if (!quoteId) return []
  const { data, error } = await supabase
    .from('renderings')
    .select('id, image_paths, created_at')
    .eq('quote_id', quoteId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const out = []
  for (const row of data ?? []) {
    const urls = []
    for (const p of row.image_paths ?? []) {
      const { data: s } = await supabase.storage.from('renderings').createSignedUrl(p, 3600)
      if (s?.signedUrl) urls.push(s.signedUrl)
    }
    if (urls.length) out.push({ id: row.id, urls, createdAt: row.created_at })
  }
  return out
}
