// Pure functions for reading and changing a budget document. No Firebase here,
// so they can be tested directly. The maths comes from the app itself
// (src/lib) so Claude sees exactly the numbers the app shows.

import { billsSnapshot, billStatus, annualAmount, perPeriod, markBillPaid, isBill } from '../src/lib/finance.js'
import { FREQUENCIES } from '../src/lib/schedule.js'
import { toISODate, parseDate, todayISO } from '../src/lib/dates.js'
import { normalizeSalaries, normalizeSettings } from '../src/lib/migrate.js'

export const PAYMENT_TYPE_VALUES = ['direct_debit', 'standing_order', 'card', 'manual']

const ISO = /^\d{4}-\d{2}-\d{2}$/
const round2 = (n) => Math.round(n * 100) / 100

export class BudgetError extends Error {}

/** The budget as the app sees it (older data upgraded in memory). */
export function normalize(data) {
  const people = data.people || []
  const salaries = normalizeSalaries(data.salaries)
  return {
    ...data,
    people,
    salaries,
    expenses: data.expenses || [],
    categories: data.categories || [],
    staticAmounts: data.staticAmounts || [],
    settings: normalizeSettings(data.settings, people, salaries, data.lastTransfers)
  }
}

export function findExpense(expenses, ref) {
  if (ref === undefined || ref === null || ref === '') throw new BudgetError('Say which bill (its name or id).')
  const byId = expenses.find(e => String(e.id) === String(ref))
  if (byId) return byId
  const key = String(ref).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const matches = expenses.filter(e => String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new BudgetError(`More than one item is called "${ref}" — use its id (${matches.map(m => m.id).join(', ')}).`)
  throw new BudgetError(`No item called "${ref}". Use get_budget to see the names.`)
}

function resolvePerson(people, ref) {
  if (ref === undefined) return undefined
  if (ref === null || String(ref).toLowerCase() === 'shared' || ref === '') return null
  const p = people.find(x => String(x.id) === String(ref) || x.name.toLowerCase() === String(ref).toLowerCase())
  if (!p) throw new BudgetError(`No person "${ref}". People: ${people.map(x => x.name).join(', ')} (or "shared").`)
  return p.id
}

/** Find a category by id or name; creates it (returned in `created`) if the name is new. */
function resolveCategory(categories, ref) {
  if (ref === undefined || ref === null || ref === '') return { id: undefined, categories }
  const found = categories.find(c => String(c.id) === String(ref) || c.name.toLowerCase() === String(ref).toLowerCase())
  if (found) return { id: found.id, categories }
  const palette = ['#0ea5e9', '#6366f1', '#14b8a6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']
  const id = Date.now()
  return { id, categories: [...categories, { id, name: String(ref), color: palette[categories.length % palette.length] }], created: String(ref) }
}

/** Check and clean a set of bill fields coming from Claude. */
export function cleanFields(fields, { people, categories }) {
  const out = {}
  let cats = categories
  let createdCategory = null
  const has = (k) => Object.prototype.hasOwnProperty.call(fields, k)

  if (has('name')) {
    if (!String(fields.name).trim()) throw new BudgetError('Name can\'t be empty.')
    out.name = String(fields.name).trim()
  }
  if (has('amount')) {
    const n = Number(fields.amount)
    if (!isFinite(n) || n < 0) throw new BudgetError('Amount must be a number of 0 or more.')
    out.amount = round2(n)
  }
  if (has('frequency')) {
    if (!FREQUENCIES.includes(fields.frequency)) throw new BudgetError(`Frequency must be one of ${FREQUENCIES.join(', ')}.`)
    out.frequency = fields.frequency
  }
  if (has('paymentType')) {
    if (!PAYMENT_TYPE_VALUES.includes(fields.paymentType)) throw new BudgetError(`paymentType must be one of ${PAYMENT_TYPE_VALUES.join(', ')}.`)
    out.paymentType = fields.paymentType
  }
  if (has('itemType')) {
    if (!['expense', 'saving'].includes(fields.itemType)) throw new BudgetError('itemType must be "expense" or "saving".')
    out.itemType = fields.itemType
  }
  for (const k of ['lastPaid', 'nextDueDate', 'subscriptionEndDate', 'priceChangeDate']) {
    if (!has(k)) continue
    const v = fields[k]
    if (v === null || v === '') { out[k] = ''; continue }
    if (!ISO.test(v) || !parseDate(v)) throw new BudgetError(`${k} must be a date like 2026-11-27.`)
    out[k] = v
  }
  if (has('priceChangeAmount')) {
    out.priceChangeAmount = fields.priceChangeAmount === null || fields.priceChangeAmount === '' ? null : round2(Number(fields.priceChangeAmount))
  }
  for (const k of ['paused', 'fromBillsAccount']) if (has(k)) out[k] = !!fields[k]
  for (const k of ['notes', 'company']) if (has(k)) out[k] = fields[k] == null ? '' : String(fields[k])
  if (has('person')) out.personId = resolvePerson(people, fields.person)
  if (has('category')) {
    const r = resolveCategory(cats, fields.category)
    out.categoryId = r.id
    cats = r.categories
    createdCategory = r.created || null
  }
  return { fields: out, categories: cats, createdCategory }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** A readable summary of the whole budget, including the Bills-tab numbers. */
export function summarize(raw, date = todayISO()) {
  const b = normalize(raw)
  const { people, salaries, expenses, categories, settings, staticAmounts } = b
  const snap = billsSnapshot({
    expenses, people, salaries, settings, staticAmounts,
    balance: settings.billsAccountBalance, cardOwing: settings.cardOwing, date
  })
  const personName = (id) => people.find(p => p.id === id)?.name || 'Shared'
  const catName = (id) => categories.find(c => c.id === id)?.name || null

  return {
    name: b.info?.name,
    today: date,
    people: people.map(p => ({ id: p.id, name: p.name })),
    income: salaries.map(s => ({
      id: s.id, person: personName(s.personId), source: s.source, amount: s.amount, frequency: s.frequency,
      paySchedule: s.schedule || null
    })),
    billsAccount: {
      balance: settings.billsAccountBalance ?? null,
      balanceUpdated: settings.billsBalanceUpdated || null,
      cardOwing: settings.cardOwing ?? 0,
      requiredToday: round2(snap.required),
      surplus: snap.surplus === null ? null : round2(snap.surplus),
      breakdown: {
        setAsideForBills: round2(snap.accruedBills),
        buffers: round2(snap.staticTotal),
        cardOwing: round2(snap.cardOwing),
        checkpoint: snap.checkpoint ? toISODate(snap.checkpoint) : null,
        buildUpByCheckpoint: round2(snap.buildUp),
        transfersByCheckpoint: round2(snap.incoming),
        onTrack: round2(snap.onTrack),
        cashNeededBeforeTransfers: round2(snap.cashNeed)
      },
      billsPerFortnight: round2(perPeriod(snap.plan.annualNeeded, 'fortnightly')),
      transferSplit: snap.plan.method,
      transfers: people.map(p => {
        const t = snap.plan.people[p.id] || {}
        return {
          person: p.name,
          perTransfer: round2(t.perTransfer || 0),
          frequency: t.frequency,
          nextDate: t.nextDate ? toISODate(t.nextDate) : null,
          settings: settings.peopleTransferSettings?.[p.id] || {}
        }
      })
    },
    buffers: staticAmounts.map(s => ({ id: s.id, description: s.description, amount: s.amount })),
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    items: expenses.map(e => {
      const st = billStatus(e, date)
      return {
        id: e.id,
        name: e.name,
        type: e.itemType || 'expense',
        amount: e.amount,
        frequency: e.frequency,
        perFortnight: round2(perPeriod(annualAmount(e, date), 'fortnightly')),
        category: catName(e.categoryId),
        person: personName(e.personId),
        paymentType: e.paymentType || 'direct_debit',
        fromBillsAccount: isBill(e),
        paused: !!e.paused,
        lastPaid: e.lastPaid || null,
        nextDueStored: e.nextDueDate || null,
        nextDue: st.nextDue ? toISODate(st.nextDue) : null,
        setAsideNow: round2(st.accrued),
        overdue: st.overdue,
        notes: e.notes || undefined,
        subscriptionEndDate: e.subscriptionEndDate || undefined,
        priceChange: e.priceChangeDate ? { date: e.priceChangeDate, amount: e.priceChangeAmount } : undefined
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Changes. Each takes the raw document and returns { update, message } where
// `update` is the top-level fields to write.
// ---------------------------------------------------------------------------

export function updateItems(raw, changes) {
  const b = normalize(raw)
  let expenses = [...b.expenses]
  let categories = b.categories
  const notes = []
  changes.forEach(({ item, set }) => {
    const target = findExpense(expenses, item)
    const r = cleanFields(set || {}, { people: b.people, categories })
    categories = r.categories
    if (r.createdCategory) notes.push(`created category "${r.createdCategory}"`)
    expenses = expenses.map(e => (e.id === target.id ? { ...e, ...r.fields } : e))
    notes.push(`${target.name}: ${Object.entries(r.fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') || 'no changes'}`)
  })
  const update = { expenses }
  if (categories !== b.categories) update.categories = categories
  return { update, message: `Updated ${changes.length} item(s). ${notes.join('; ')}` }
}

export function addItem(raw, fields) {
  const b = normalize(raw)
  if (!fields.name || fields.amount === undefined || !fields.frequency) throw new BudgetError('A new item needs name, amount and frequency.')
  const r = cleanFields(fields, { people: b.people, categories: b.categories })
  const exists = b.expenses.some(e => e.name.toLowerCase() === r.fields.name.toLowerCase())
  if (exists) throw new BudgetError(`There's already an item called "${r.fields.name}" — update it instead.`)
  const item = {
    itemType: 'expense',
    paymentType: 'direct_debit',
    fromBillsAccount: true,
    paused: false,
    personId: null,
    lastPaid: '',
    nextDueDate: '',
    notes: '',
    ...r.fields,
    id: Date.now()
  }
  if (item.itemType === 'expense' && item.categoryId === undefined) {
    const other = resolveCategory(r.categories, 'Other')
    item.categoryId = other.id
    r.categories = other.categories
  }
  if (item.categoryId === undefined) item.categoryId = null
  const update = { expenses: [...b.expenses, item] }
  if (r.categories !== b.categories) update.categories = r.categories
  return { update, message: `Added "${item.name}" (id ${item.id}).` }
}

export function removeItem(raw, ref) {
  const b = normalize(raw)
  const target = findExpense(b.expenses, ref)
  return { update: { expenses: b.expenses.filter(e => e.id !== target.id) }, message: `Removed "${target.name}".` }
}

export function markPaid(raw, ref, date = todayISO()) {
  const b = normalize(raw)
  const target = findExpense(b.expenses, ref)
  const patch = markBillPaid(target, date)
  return {
    update: { expenses: b.expenses.map(e => (e.id === target.id ? { ...e, ...patch } : e)) },
    message: `Marked "${target.name}" paid on ${patch.lastPaid}; next due ${patch.nextDueDate}.`
  }
}

/** Bills-account settings: balance, card, split method and per-person transfer options. */
export function updateBillsSettings(raw, { balance, cardOwing, transferSplit, people: personChanges }) {
  const b = normalize(raw)
  const settings = { ...b.settings, peopleTransferSettings: { ...b.settings.peopleTransferSettings } }
  const done = []
  if (balance !== undefined) {
    settings.billsAccountBalance = balance === null ? null : round2(Number(balance))
    settings.billsBalanceUpdated = todayISO()
    done.push(`balance ${settings.billsAccountBalance}`)
  }
  if (cardOwing !== undefined) {
    settings.cardOwing = cardOwing === null ? null : round2(Number(cardOwing))
    done.push(`card owing ${settings.cardOwing}`)
  }
  if (transferSplit !== undefined) {
    if (!['income', 'equal', 'owner', 'custom'].includes(transferSplit)) throw new BudgetError('transferSplit must be income, equal, owner or custom.')
    settings.transferSplit = transferSplit
    done.push(`split ${transferSplit}`)
  }
  ;(personChanges || []).forEach(pc => {
    const id = resolvePerson(b.people, pc.person)
    if (id === null) throw new BudgetError('Transfer settings need a specific person.')
    const cur = { ...(settings.peopleTransferSettings[id] || {}) }
    if (pc.mode === 'fixed') Object.assign(cur, { topUp: false, amountType: 'fixed' })
    if (pc.mode === 'percent') Object.assign(cur, { topUp: false, amountType: 'percent' })
    if (pc.mode === 'topUp') cur.topUp = true
    if (pc.fixedAmount !== undefined) cur.fixedAmount = pc.fixedAmount === null ? null : round2(Number(pc.fixedAmount))
    if (pc.percentOfIncome !== undefined) cur.percentOfIncome = pc.percentOfIncome === null ? null : Number(pc.percentOfIncome)
    if (pc.followsPay !== undefined) cur.followsPay = !!pc.followsPay
    settings.peopleTransferSettings[id] = cur
    done.push(`${pc.person}: ${JSON.stringify(cur)}`)
  })
  return { update: { settings }, message: `Updated bills settings — ${done.join('; ') || 'nothing changed'}.` }
}

export function setBuffer(raw, { id, description, amount, remove }) {
  const b = normalize(raw)
  let list = [...b.staticAmounts]
  if (remove) {
    const before = list.length
    list = list.filter(s => String(s.id) !== String(id) && s.description !== description)
    if (list.length === before) throw new BudgetError('No buffer with that id/description.')
    return { update: { staticAmounts: list }, message: 'Removed buffer.' }
  }
  const existing = list.find(s => (id !== undefined && String(s.id) === String(id)) || (description && s.description?.toLowerCase() === description.toLowerCase()))
  if (existing) {
    list = list.map(s => (s === existing ? { ...s, description: description ?? s.description, amount: amount !== undefined ? round2(Number(amount)) : s.amount } : s))
    return { update: { staticAmounts: list }, message: `Updated buffer "${description ?? existing.description}".` }
  }
  if (!description || amount === undefined) throw new BudgetError('A new buffer needs a description and amount.')
  list.push({ id: Date.now(), description, amount: round2(Number(amount)) })
  return { update: { staticAmounts: list }, message: `Added buffer "${description}".` }
}
