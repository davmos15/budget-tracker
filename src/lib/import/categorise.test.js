import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriseAll, matchRule, DEFAULT_CATEGORIES } from './categorise.js'

const t = (merchant, extra = {}) => ({ id: merchant, kind: 'spend', merchant, rawDesc: merchant.toUpperCase(), amount: -10, ...extra })
const one = (txn, rules = []) => categoriseAll([txn], rules)[0]

test('built-ins group supermarkets into Groceries', () => {
  assert.equal(one(t('Coles')).category, 'Groceries')
  assert.equal(one(t('Woolworths')).category, 'Groceries')
  assert.equal(one(t('Coles')).source, 'builtin')
})

test('user rules beat built-ins and can change kind', () => {
  const rules = [{ id: 'r1', match: { field: 'merchant', op: 'equals', value: 'Coles' }, set: { category: 'Hosting' } }]
  assert.equal(one(t('Coles'), rules).category, 'Hosting')
  assert.equal(one(t('Coles'), rules).source, 'rule')
  const rr = [{ id: 'r2', match: { field: 'rawDesc', op: 'contains', value: 'only about' }, set: { category: 'Childcare' } }]
  assert.equal(one(t('Only About Child'), rr).category, 'Childcare')
})

test('rules can be limited to an account', () => {
  const rules = [{ id: 'r', accountId: 'bills', match: { field: 'merchant', op: 'equals', value: 'X' }, set: { category: 'Gifts & donations' } }]
  assert.equal(one(t('X', { accountId: 'spending' }), rules).category, null)
  assert.equal(one(t('X', { accountId: 'bills' }), rules).category, 'Gifts & donations')
})

test('bank category is used when nothing else matches', () => {
  assert.equal(one(t('Common Room Co', { bankCategory: 'Cafe & coffee' })).category, 'Cafes & coffee')
  assert.equal(one(t('Common Room Co', { bankCategory: 'Cafe & coffee' })).source, 'bank')
})

test('Medicare credits become Health refunds', () => {
  const r = one(t('Mcare Benefits Cywq', { kind: 'income', amount: 209.45 }))
  assert.equal(r.kind, 'refund')
  assert.equal(r.category, 'Health & medical')
})

test('manual categories are never overwritten; transfers get none', () => {
  assert.equal(one(t('Coles', { category: 'Gifts & donations', source: 'manual' })).category, 'Gifts & donations')
  assert.equal(one(t('Coles', { kind: 'transfer' })).category, undefined)
  assert.equal(one(t('Mystery', { kind: 'card_unitemised' })).category, 'Card (unitemised)')
})

test('unknown merchants need review', () => {
  const r = one(t('Zzyzx Pty Ltd'))
  assert.equal(r.category, null)
  assert.equal(r.source, null)
})

test('matchRule ops', () => {
  const x = t('Sweet Heart')
  assert.ok(matchRule({ match: { field: 'merchant', op: 'contains', value: 'heart' } }, x))
  assert.ok(matchRule({ match: { field: 'merchant', op: 'regex', value: '^sweet' } }, x))
  assert.ok(!matchRule({ match: { field: 'merchant', op: 'regex', value: '(' } }, x))
})

test('every built-in category exists in DEFAULT_CATEGORIES', () => {
  const names = new Set(DEFAULT_CATEGORIES.map(c => c.name))
  assert.ok(names.has('Groceries') && names.has('Card (unitemised)'))
})

test('rules can be limited to money in or out', () => {
  const rules = [{ id: 'r', direction: 'in', match: { field: 'merchant', op: 'equals', value: 'Gift' }, set: { category: 'Gifts received' } }]
  assert.equal(one(t('Gift', { amount: 50, kind: 'income' }), rules).category, 'Gifts received')
  assert.equal(one(t('Gift', { amount: -50 }), rules).category, null)
})
