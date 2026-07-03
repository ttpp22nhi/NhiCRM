import type { CbsOrderDetail } from '@/components/CbsOrderDetailModal'

export type CbsOrderRow = CbsOrderDetail & {
  claimed_by_username?: string | null
  claimed_by_territory?: string | null
  claimed_by_role?: string | null
}

export type CbsOrderGroup = CbsOrderRow & {
  _groupKey: string
  _childIds: string[]
  _childCount: number
  _children: CbsOrderRow[]
}

function contractGroupKey(o: CbsOrderRow): string {
  const cn = String(o.contract_no || '').trim()
  if (cn) return `contract:${cn}`
  return `order:${o.id}`
}

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function maxMs(...values: Array<string | number | null | undefined>): number | null {
  let best: number | null = null
  for (const v of values) {
    if (v == null || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    if (best == null || n > best) best = n
  }
  return best
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const s = String(v || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function mergeClaimState(children: CbsOrderRow[]): {
  claimed_by: string | null
  claimed_by_name: string | null
  claimed_by_username: string | null
  claimed_by_territory: string | null
  claim_status: string | null
} {
  const claimedIds = uniqueStrings(children.map((c) => c.claimed_by))
  const statuses = uniqueStrings(children.map((c) => c.claim_status))

  if (claimedIds.length === 0) {
    return {
      claimed_by: null,
      claimed_by_name: null,
      claimed_by_username: null,
      claimed_by_territory: null,
      claim_status: null,
    }
  }

  if (claimedIds.length > 1 || statuses.length > 1) {
    const primary = [...children].sort((a, b) => num(b.price_vat) - num(a.price_vat))[0]
    return {
      claimed_by: primary?.claimed_by || claimedIds[0] || null,
      claimed_by_name: primary?.claimed_by_name || null,
      claimed_by_username: primary?.claimed_by_username || null,
      claimed_by_territory: primary?.claimed_by_territory || null,
      claim_status: 'mixed',
    }
  }

  const primary = children.find((c) => c.claimed_by) || children[0]
  return {
    claimed_by: primary?.claimed_by || null,
    claimed_by_name: primary?.claimed_by_name || null,
    claimed_by_username: primary?.claimed_by_username || null,
    claimed_by_territory: primary?.claimed_by_territory || null,
    claim_status: primary?.claim_status || null,
  }
}

function formatProductSummary(children: CbsOrderRow[]): {
  product_name: string | null
  product_code: string | null
} {
  const names = uniqueStrings(children.map((c) => c.product_name))
  const codes = uniqueStrings(children.map((c) => c.product_code))
  if (names.length === 0) {
    return { product_name: null, product_code: codes[0] || null }
  }
  if (names.length === 1) {
    return { product_name: names[0], product_code: codes[0] || null }
  }
  return {
    product_name: `${names[0]} (+${names.length - 1} SP)`,
    product_code: codes.length > 1 ? `${codes.length} mã` : codes[0] || null,
  }
}

function formatSerialSummary(children: CbsOrderRow[]): { serial: string | null } {
  const serials = uniqueStrings(children.map((c) => c.serial))
  if (serials.length === 0) return { serial: null }
  if (serials.length === 1) return { serial: serials[0] }
  return { serial: `${serials[0]} (+${serials.length - 1})` }
}

/** Gộp các dòng cùng số hợp đồng; cột tiền cộng dồn. Không có HĐ → giữ từng dòng. */
export function groupCbsOrdersByContract(orders: CbsOrderRow[]): CbsOrderGroup[] {
  const buckets = new Map<string, CbsOrderRow[]>()
  for (const o of orders) {
    const key = contractGroupKey(o)
    const list = buckets.get(key)
    if (list) list.push(o)
    else buckets.set(key, [o])
  }

  const groups: CbsOrderGroup[] = []
  for (const [groupKey, children] of buckets) {
    const sorted = [...children].sort((a, b) => num(b.price_vat) - num(a.price_vat))
    const primary = sorted[0]
    const claim = mergeClaimState(children)
    const products = formatProductSummary(children)
    const serialSummary = formatSerialSummary(children)

    groups.push({
      ...primary,
      ...claim,
      ...products,
      serial: serialSummary.serial,
      price_vat: children.reduce((s, c) => s + num(c.price_vat), 0),
      price_not_vat: children.reduce((s, c) => s + num(c.price_not_vat), 0),
      price_not_vat_round: children.reduce((s, c) => s + num(c.price_not_vat_round), 0),
      vat: children.reduce((s, c) => s + num(c.vat), 0),
      active_date: maxMs(...children.map((c) => c.active_date)),
      payment_date: maxMs(...children.map((c) => c.payment_date)),
      _groupKey: groupKey,
      _childIds: children.map((c) => c.id),
      _childCount: children.length,
      _children: sorted,
    })
  }

  groups.sort((a, b) => {
    const da = maxMs(a.active_date, a.payment_date) ?? 0
    const db = maxMs(b.active_date, b.payment_date) ?? 0
    if (db !== da) return db - da
    return num(b.price_vat) - num(a.price_vat)
  })

  return groups
}
