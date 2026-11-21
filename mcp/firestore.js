// Firestore access for the MCP server, using a Firebase service account.
//
// Credentials (first one found):
//   FIREBASE_SERVICE_ACCOUNT        the service-account JSON itself (or base64 of it)
//   GOOGLE_APPLICATION_CREDENTIALS  path to the service-account JSON file
//   your own Google login           after `gcloud auth application-default login`
//                                   (handy when running Claude Code on your own computer)
// Whose budgets (required — the admin login can see every user's data, so we
// only ever touch budgets this person is a member of):
//   BUDGET_USER_EMAIL               your sign-in email, or
//   mcp/config.local.json           { "userEmail": "you@example.com" }  (gitignored)
// Optional:
//   BUDGET_ID (or "budget" in config.local.json)  default budget when you have more than one

import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let db = null

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw && raw.trim()) {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    let json
    try { json = JSON.parse(text) } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON (or base64 JSON).') }
    return { credential: cert(json), projectId: json.project_id }
  }
  const adcFile = process.platform === 'win32'
    ? join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json')
    : join(homedir(), '.config', 'gcloud', 'application_default_credentials.json')
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || existsSync(adcFile)) {
    return { credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || firebaseProject() }
  }
  throw new Error('No Firebase credentials. Either run `gcloud auth application-default login` on this computer, or set FIREBASE_SERVICE_ACCOUNT (service-account JSON) and start a new session.')
}

/** Project id from the repo's .firebaserc */
function firebaseProject() {
  try {
    const rc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
    return rc.projects?.default
  } catch {
    return undefined
  }
}

export function getDb() {
  if (db) return db
  const { credential, projectId } = loadCredential()
  const app = getApps()[0] || initializeApp({ credential, projectId })
  db = getFirestore(app)
  // REST instead of gRPC so it works through HTTPS proxies
  db.settings({ preferRest: true, ignoreUndefinedProperties: true })
  return db
}

function localConfig() {
  const file = new URL('./config.local.json', import.meta.url)
  if (!existsSync(file)) return {}
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}

function configuredEmail() {
  return process.env.BUDGET_USER_EMAIL || localConfig().userEmail || null
}

let myUid = null
/** The uid of the person this server works for. */
async function currentUid() {
  if (myUid) return myUid
  const email = configuredEmail()
  if (!email) throw new Error('Say whose budgets to use: set BUDGET_USER_EMAIL or create mcp/config.local.json with { "userEmail": "you@example.com" }.')
  const snap = await getDb().collection('userEmails').doc(email.trim().toLowerCase()).get()
  if (!snap.exists) throw new Error(`No app user with email ${email}. Sign in to the app once with that email.`)
  myUid = snap.get('uid')
  return myUid
}

/** Budgets you are a member of (your own + shared with you): [{ ownerId, budgetId, name, members }] */
export async function listBudgets() {
  const uid = await currentUid()
  const users = getDb().collection('users')
  const own = (await users.doc(uid).collection('budgets').get()).docs
  const shared = (await users.doc(uid).get()).get('sharedBudgets') || []
  const sharedDocs = await Promise.all(shared.map(s => users.doc(s.ownerId).collection('budgets').doc(s.budgetId).get()))
  const seen = new Set()
  return [...own, ...sharedDocs]
    .filter(d => d.exists && (d.get('info.members') || []).includes(uid))
    .filter(d => !seen.has(d.ref.path) && seen.add(d.ref.path))
    .map(d => ({
      ownerId: d.ref.parent.parent.id,
      budgetId: d.id,
      name: d.get('info.name') || d.id,
      members: (d.get('info.members') || []).length
    }))
}

/** Find a budget by id or name; defaults to BUDGET_ID or the only budget. */
export async function resolveBudget(ref) {
  const all = await listBudgets()
  const want = ref || process.env.BUDGET_ID || localConfig().budget
  if (!want) {
    if (all.length === 1) return all[0]
    throw new Error(`There are ${all.length} budgets — say which one: ${all.map(b => `"${b.name}"`).join(', ')}.`)
  }
  const lower = String(want).toLowerCase()
  const found = all.filter(b => b.budgetId === want || b.name.toLowerCase() === lower)
  if (found.length === 1) return found[0]
  if (found.length > 1) throw new Error(`More than one budget matches "${want}" — use its id.`)
  throw new Error(`No budget "${want}". Budgets: ${all.map(b => `"${b.name}" (${b.budgetId})`).join(', ')}.`)
}

function budgetRef(b) {
  return getDb().collection('users').doc(b.ownerId).collection('budgets').doc(b.budgetId)
}

export async function readBudget(ref) {
  const b = await resolveBudget(ref)
  const doc = await budgetRef(b).get()
  if (!doc.exists) throw new Error('Budget not found.')
  return { meta: b, data: doc.data() }
}

/**
 * Read-modify-write inside a transaction, so a change made in the app at the
 * same moment isn't overwritten. `change(data)` returns { update, message }.
 */
export async function changeBudget(ref, change) {
  const b = await resolveBudget(ref)
  const docRef = budgetRef(b)
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(docRef)
    if (!doc.exists) throw new Error('Budget not found.')
    const { update, message } = change(doc.data())
    tx.update(docRef, update)
    return message
  })
}

// ---------------------------------------------------------------------------
// Imported transactions: txMonths/{YYYY-MM} and txMeta/config
// ---------------------------------------------------------------------------

/** { meta, byMonth: { 'YYYY-MM': txns }, config: { accounts, rules } } */
export async function readLedger(ref) {
  const b = await resolveBudget(ref)
  const base = budgetRef(b)
  const [months, cfg] = await Promise.all([base.collection('txMonths').get(), base.collection('txMeta').doc('config').get()])
  const byMonth = {}
  months.forEach(d => { byMonth[d.id] = d.get('transactions') || [] })
  const c = cfg.exists ? cfg.data() : {}
  return { meta: b, byMonth, config: { accounts: c.accounts || [], rules: c.rules || [] } }
}

const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/** Write whole months; an empty month is deleted. */
export async function writeMonths(meta, byMonth) {
  const col = budgetRef(meta).collection('txMonths')
  const entries = Object.entries(byMonth)
  for (let i = 0; i < entries.length; i += 25) {
    const batch = getDb().batch()
    for (const [month, txns] of entries.slice(i, i + 25)) {
      if (txns.length === 0) batch.delete(col.doc(month))
      else batch.set(col.doc(month), { month, transactions: txns.map(stripUndefined), updatedAt: new Date() })
    }
    await batch.commit()
  }
}

export async function writeConfig(meta, config) {
  await budgetRef(meta).collection('txMeta').doc('config').set({
    accounts: config.accounts.map(stripUndefined),
    rules: config.rules.map(stripUndefined),
    updatedAt: new Date()
  }, { merge: true })
}
