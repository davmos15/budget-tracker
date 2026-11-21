// Firestore access for the MCP server, using a Firebase service account.
//
// Credentials (first one found):
//   FIREBASE_SERVICE_ACCOUNT        the service-account JSON itself (or base64 of it)
//   GOOGLE_APPLICATION_CREDENTIALS  path to the service-account JSON file
//   your own Google login           after `gcloud auth application-default login`
//                                   (handy when running Claude Code on your own computer)
// Optional:
//   BUDGET_ID                       default budget when you have more than one

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

/** All budgets in the project: [{ ownerId, budgetId, name, members }] */
export async function listBudgets() {
  const snap = await getDb().collectionGroup('budgets').get()
  return snap.docs.map(d => ({
    ownerId: d.ref.parent.parent.id,
    budgetId: d.id,
    name: d.get('info.name') || d.id,
    members: (d.get('info.members') || []).length
  }))
}

/** Find a budget by id or name; defaults to BUDGET_ID or the only budget. */
export async function resolveBudget(ref) {
  const all = await listBudgets()
  const want = ref || process.env.BUDGET_ID
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
