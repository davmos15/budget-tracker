// Decide what each transaction *is*, so money moving between your own accounts
// (and paying off the card) is never counted as spending. Pure functions only.
//
// kind:
//   spend, income, refund, fee      count in spending/income
//   redraw_spend                    paid straight out of a loan (e.g. a BPAY) — counts as spending
//   card_unitemised                 card repayment for a period with no card data — counts as spending
//   transfer                        between your own accounts (incl. loan redraws into Bills)
//   cc_repayment                    card repayment when the card's purchases are imported — ignored
//   loan_interest, loan_repayment   used by the mortgage tracker, not spending
//   debt_repayment                  paying back a personal loan — money out, but not spending
//                                   (only ever set by a rule or by hand)
//
// Account: { id, name, kind: 'transaction'|'offset'|'loan'|'card', number?, repaymentMatch? }
// A transaction with kindLocked: true keeps the kind the user gave it.

import { extractReceipt, extractCounterparty, transferLabel } from './merchant.js'
import { diffDays } from '../dates.js'

const CARD_REPAYMENT = /\b(CC|CREDIT CARD|CARD)\s+(RE)?PAYMENT\b|\bCARD REPAY/i

const last8 = (n) => (n ? String(n).replace(/\D/g, '').slice(-8) : null)
const sameMoney = (a, b) => Math.abs(a + b) < 0.005

/** Pair transfers: same receipt (or a counterpart account we own), opposite amounts, within 2 days. */
function pairTransfers(txns, accountsById, ownNumbers) {
  const pairs = new Map()
  const byReceipt = new Map()
  for (const t of txns) {
    const r = extractReceipt(t.rawDesc)
    if (!r) continue
    if (!byReceipt.has(r)) byReceipt.set(r, [])
    byReceipt.get(r).push(t)
  }
  const tryPair = (t, candidates) => {
    let best = null
    for (const c of candidates) {
      if (c === t || c.accountId === t.accountId || pairs.has(c.id) || !sameMoney(t.amount, c.amount)) continue
      const gap = Math.abs(diffDays(t.date, c.date))
      if (gap <= 2 && (!best || gap < best.gap)) best = { c, gap }
    }
    if (best) { pairs.set(t.id, best.c.id); pairs.set(best.c.id, t.id) }
  }
  for (const t of txns) {
    if (pairs.has(t.id)) continue
    const r = extractReceipt(t.rawDesc)
    if (r) tryPair(t, byReceipt.get(r))
  }
  // Fallback: description names one of our accounts
  const byAccount = new Map()
  for (const t of txns) {
    if (!byAccount.has(t.accountId)) byAccount.set(t.accountId, [])
    byAccount.get(t.accountId).push(t)
  }
  for (const t of txns) {
    if (pairs.has(t.id)) continue
    const cp = extractCounterparty(t.rawDesc)
    const acct = cp && ownNumbers.get(cp)
    if (acct && acct !== t.accountId) tryPair(t, byAccount.get(acct) || [])
  }
  return pairs
}

/** First transaction date per card account (card data covers from then on). */
function cardCoverage(txns, accounts) {
  const start = {}
  for (const a of accounts) if (a.kind === 'card') start[a.id] = null
  for (const t of txns) {
    if (t.accountId in start && (!start[t.accountId] || t.date < start[t.accountId])) start[t.accountId] = t.date
  }
  return start
}

function kindFor(t, account, ctx) {
  const desc = t.rawDesc || ''
  const paired = ctx.pairs.has(t.id)
  const counterparty = extractCounterparty(desc)
  const toOwn = counterparty && ctx.ownNumbers.has(counterparty)

  if (account?.kind === 'loan') {
    if (/interest charge/i.test(desc)) return { kind: 'loan_interest' }
    if (/\bfees?\b/i.test(desc) && !paired) return { kind: 'fee' }
    if (t.amount > 0) return { kind: 'loan_repayment' }
    if (paired || toOwn) return { kind: 'transfer', label: transferLabel(desc) }
    return { kind: 'redraw_spend', label: transferLabel(desc) }
  }

  if (account?.kind === 'card') {
    const type = (t.txType || '').toUpperCase()
    if (t.amount > 0 && (type.includes('PAYMENT') || /PAYMENT|THANK YOU/i.test(desc))) return { kind: 'transfer' }
    if (type === 'FEES' || type.includes('INTEREST')) return { kind: 'fee' }
    if (t.amount > 0) return { kind: 'refund' }
    return { kind: 'spend' }
  }

  // Everyday / offset accounts
  if (paired) return { kind: 'transfer', label: transferLabel(desc) }
  if (t.amount < 0) {
    const card = ctx.cards.find(c => c.repaymentMatch && desc.toUpperCase().includes(c.repaymentMatch.toUpperCase()))
    if (card && CARD_REPAYMENT.test(desc)) {
      const from = ctx.coverage[card.id]
      return { kind: from && t.date >= from ? 'cc_repayment' : 'card_unitemised' }
    }
    if (CARD_REPAYMENT.test(desc)) return { kind: 'card_unitemised' }
  }
  if (/internal transfer/i.test(desc) || toOwn) {
    return { kind: 'transfer', label: transferLabel(desc), unpaired: true }
  }
  return { kind: t.amount >= 0 ? 'income' : 'spend' }
}

/** Returns new transaction objects with kind, label, transferPairId and unpaired set. */
export function classifyAll(txns, accounts) {
  const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]))
  const ownNumbers = new Map(accounts.filter(a => a.number).map(a => [last8(a.number), a.id]))
  const ctx = {
    pairs: pairTransfers(txns, accountsById, ownNumbers),
    ownNumbers,
    cards: accounts.filter(a => a.kind === 'card'),
    coverage: cardCoverage(txns, accounts)
  }
  return txns.map(t => {
    const { kind, label, unpaired } = kindFor(t, accountsById[t.accountId], ctx)
    const out = { ...t, kind: t.kindLocked ? t.kind : kind }
    delete out.label; delete out.unpaired; delete out.transferPairId
    if (label) out.label = label
    if (unpaired && !t.kindLocked) out.unpaired = true
    if (ctx.pairs.has(t.id)) out.transferPairId = ctx.pairs.get(t.id)
    return out
  })
}
