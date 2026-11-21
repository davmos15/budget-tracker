// Security rules tests. Run with `npm run test:rules` (starts the Firestore emulator).
import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, arrayUnion } from 'firebase/firestore'

let env
const BUDGET = 'users/alice/budgets/b1'

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-budget',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  })
})
after(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, BUDGET), {
      info: { name: 'Ours', code: 'ABC123', members: ['alice', 'carol'], admins: ['alice'], createdBy: 'alice', invitedEmails: ['bob@x.com'] },
      expenses: []
    })
    await setDoc(doc(db, 'budgetCodes/ABC123'), { ownerId: 'alice', budgetId: 'b1' })
    await setDoc(doc(db, `${BUDGET}/txMonths/2026-11`), { month: '2026-11', transactions: [] })
    await setDoc(doc(db, `${BUDGET}/txMeta/config`), { accounts: [], rules: [] })
    await setDoc(doc(db, 'userEmails/alice@x.com'), { uid: 'alice' })
    await setDoc(doc(db, 'pendingInvites/bob@x.com'), { invites: [{ ownerId: 'alice', budgetId: 'b1' }] })
  })
})

const as = (uid, token = {}) => env.authenticatedContext(uid, token).firestore()
const verified = (email) => ({ email, email_verified: true })

test('strangers cannot list codes, emails or pending invites', async () => {
  const db = as('mallory')
  await assertFails(getDocs(collection(db, 'budgetCodes')))
  await assertFails(getDocs(collection(db, 'userEmails')))
  await assertFails(getDocs(collection(db, 'pendingInvites')))
})

test('a code can still be looked up directly', async () => {
  await assertSucceeds(getDoc(doc(as('mallory'), 'budgetCodes/ABC123')))
})

test('stranger cannot read the budget', async () => {
  await assertFails(getDoc(doc(as('mallory'), BUDGET)))
})

test('stranger cannot join without proving the code', async () => {
  await assertFails(updateDoc(doc(as('mallory'), BUDGET), { 'info.members': arrayUnion('mallory') }))
})

test('joining with the code works, and only adds yourself', async () => {
  const db = as('mallory')
  await assertSucceeds(setDoc(doc(db, 'budgetCodes/ABC123/joins/mallory'), { at: 1 }))
  await assertFails(updateDoc(doc(db, BUDGET), { 'info.members': arrayUnion('mallory', 'eve') }))
  await assertFails(updateDoc(doc(db, BUDGET), { 'info.members': arrayUnion('mallory'), expenses: [{ x: 1 }] }))
  await assertSucceeds(updateDoc(doc(db, BUDGET), { 'info.members': arrayUnion('mallory') }))
})

test('cannot create a join record for someone else', async () => {
  await assertFails(setDoc(doc(as('mallory'), 'budgetCodes/ABC123/joins/bob'), { at: 1 }))
})

test('invited email can join only when verified', async () => {
  await assertFails(updateDoc(doc(as('bob', { email: 'bob@x.com', email_verified: false }), BUDGET), { 'info.members': arrayUnion('bob') }))
  await assertFails(updateDoc(doc(as('eve', verified('eve@x.com')), BUDGET), { 'info.members': arrayUnion('eve') }))
  await assertSucceeds(updateDoc(doc(as('bob', verified('Bob@X.com')), BUDGET), { 'info.members': arrayUnion('bob') }))
})

test('only admins change members, admins or invited emails', async () => {
  await assertFails(updateDoc(doc(as('carol'), BUDGET), { 'info.invitedEmails': arrayUnion('eve@x.com') }))
  await assertFails(updateDoc(doc(as('carol'), BUDGET), { 'info.members': arrayUnion('eve') }))
  await assertSucceeds(updateDoc(doc(as('carol'), BUDGET), { expenses: [{ id: 1 }] }))
  await assertSucceeds(updateDoc(doc(as('alice'), BUDGET), { 'info.invitedEmails': arrayUnion('eve@x.com') }))
})

test('members can use transactions; strangers cannot', async () => {
  await assertSucceeds(getDoc(doc(as('carol'), `${BUDGET}/txMonths/2026-11`)))
  await assertSucceeds(setDoc(doc(as('carol'), `${BUDGET}/txMonths/2026-10`), { month: '2026-10', transactions: [] }))
  await assertSucceeds(getDocs(collection(as('carol'), `${BUDGET}/txMonths`)))
  await assertSucceeds(setDoc(doc(as('alice'), `${BUDGET}/txMeta/config`), { accounts: [], rules: [] }))
  await assertFails(getDoc(doc(as('mallory'), `${BUDGET}/txMonths/2026-11`)))
  await assertFails(getDocs(collection(as('mallory'), `${BUDGET}/txMonths`)))
  await assertFails(setDoc(doc(as('mallory'), `${BUDGET}/txMonths/2026-12`), { transactions: [] }))
  await assertFails(getDoc(doc(as('mallory'), `${BUDGET}/txMeta/config`)))
  await assertFails(setDoc(doc(as('carol'), `${BUDGET}/other/x`), { a: 1 }))
})

test('pending invites: only the verified owner of the email can read or delete', async () => {
  await assertFails(getDoc(doc(as('mallory'), 'pendingInvites/bob@x.com')))
  await assertFails(getDoc(doc(as('bob', { email: 'bob@x.com', email_verified: false }), 'pendingInvites/bob@x.com')))
  await assertSucceeds(getDoc(doc(as('bob', verified('bob@x.com')), 'pendingInvites/bob@x.com')))
  await assertSucceeds(deleteDoc(doc(as('bob', verified('bob@x.com')), 'pendingInvites/bob@x.com')))
  // anyone signed in may still leave an invite (it grants nothing on its own)
  await assertSucceeds(setDoc(doc(as('alice'), 'pendingInvites/new@x.com'), { invites: [{ ownerId: 'alice', budgetId: 'b1' }] }))
})

test('owner can list their own budgets; others cannot list them', async () => {
  await assertSucceeds(getDocs(collection(as('alice'), 'users/alice/budgets')))
  await assertFails(getDocs(collection(as('carol'), 'users/alice/budgets')))
  await assertFails(getDocs(collection(as('mallory'), 'users/alice/budgets')))
  // members still read the budget directly
  await assertSucceeds(getDoc(doc(as('carol'), BUDGET)))
})
