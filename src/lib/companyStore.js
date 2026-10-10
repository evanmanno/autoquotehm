import { supabase } from './supabaseClient'

function toDbRow(company, ownerId) {
  return {
    owner_id: ownerId,
    business_name: company.businessName ?? '',
    shop_address: company.shopAddress ?? '',
    contact_name: company.contactName ?? '',
    contact_email: company.contactEmail ?? '',
    contact_phone: company.contactPhone ?? '',
    crew_member_name: company.crewMemberName ?? '',
    your_email: company.yourEmail ?? '',
    your_phone: company.yourPhone ?? '',
    labor_rate: company.laborRate ?? 0,
    mileage_rate: company.mileageRate ?? 0,
    dump_fee: company.dumpFee ?? 0,
    min_job_charge: company.minJobCharge ?? 0,
    trip_minimum: company.tripMinimum ?? 0,
    default_margin: company.defaultMargin ?? 0,
    materials: company.materials ?? [],
    equipment: company.equipment ?? [],
    brand_color: company.brandColor ?? '#1f6f45',
    logo_url: company.logoUrl ?? null,
    industries: company.industries ?? [],
    // Only sent once a tax rate exists, so saving still works before
    // supabase/migration_05_sales_tax.sql has been run.
    ...(company.salesTaxRate != null ? { sales_tax_rate: company.salesTaxRate } : {}),
    // Materials, employees and terms need supabase/migration_09_materials_employees_terms.sql.
    // Sent only when the column exists (we've read it before) or there's something to save.
    ...(company._extras === true || company.customMaterials?.length
      ? { custom_materials: company.customMaterials ?? [] }
      : {}),
    ...(company._extras === true || company.employees?.length
      ? { employees: company.employees ?? [] }
      : {}),
    ...(company._extras === true || (company.terms ?? '') !== ''
      ? { terms: company.terms ?? '' }
      : {}),
  }
}

function fromDbRow(row) {
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    businessName: row.business_name ?? '',
    shopAddress: row.shop_address ?? '',
    contactName: row.contact_name ?? '',
    contactEmail: row.contact_email ?? '',
    contactPhone: row.contact_phone ?? '',
    crewMemberName: row.crew_member_name ?? '',
    yourEmail: row.your_email ?? '',
    yourPhone: row.your_phone ?? '',
    laborRate: row.labor_rate ?? 0,
    mileageRate: row.mileage_rate ?? 0,
    dumpFee: row.dump_fee ?? 0,
    minJobCharge: row.min_job_charge ?? 0,
    tripMinimum: row.trip_minimum ?? 0,
    defaultMargin: row.default_margin ?? 0,
    materials: row.materials ?? [],
    // Older saves named some gear "(rental)"; the app no longer uses that word.
    equipment: (row.equipment ?? []).map((e) => ({
      ...e,
      name: String(e.name ?? '').replace(/\s*\(rental\)/gi, ''),
    })),
    customMaterials: row.custom_materials ?? [],
    employees: row.employees ?? [],
    terms: row.terms ?? '',
    _extras: 'custom_materials' in row,
    brandColor: row.brand_color ?? '#1f6f45',
    logoUrl: row.logo_url ?? '',
    industries: row.industries ?? [],
    salesTaxRate: row.sales_tax_rate ?? undefined,
    // Set by Settings > Manage plan (never by saveCompany, so profile edits can't change it).
    plan: row.plan ?? 'starter',
  }
}

// Every business gets exactly one row, tied to their login (owner_id).
// Row Level Security means this query can only ever see their own row.
export async function fetchCompany() {
  const { data, error } = await supabase.from('companies').select('*').maybeSingle()
  if (error) throw error
  return fromDbRow(data)
}

export async function saveCompany(company, ownerId) {
  const { data, error } = await supabase
    .from('companies')
    .upsert(toDbRow(company, ownerId), { onConflict: 'owner_id' })
    .select()
    .maybeSingle()
  if (error) throw error
  return fromDbRow(data)
}

// Uploads a business\'s logo to a per-owner folder in the public "logos"
// bucket and returns its public URL. Storage RLS only lets an owner write
// inside their own folder (see supabase/migration_03_branding.sql).
export async function uploadLogo(file, ownerId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${ownerId}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('logos').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteCompany(ownerId) {
  const { error } = await supabase.from('companies').delete().eq('owner_id', ownerId)
  if (error) throw error
}

// Changes this company's subscription plan. Billing isn't connected yet, so this
// is a plain update; once Stripe is wired up, move it behind a webhook.
export async function setCompanyPlan(companyId, planId) {
  const { data, error } = await supabase
    .from('companies')
    .update({ plan: planId })
    .eq('id', companyId)
    .select('plan')
    .maybeSingle()
  if (error) throw error
  return data?.plan ?? planId
}
