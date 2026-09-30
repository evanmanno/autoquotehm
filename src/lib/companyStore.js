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
  }
}

function fromDbRow(row) {
  if (!row) return null
  return {
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
    equipment: row.equipment ?? [],
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

export async function deleteCompany(ownerId) {
  const { error } = await supabase.from('companies').delete().eq('owner_id', ownerId)
  if (error) throw error
}
