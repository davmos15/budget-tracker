#!/usr/bin/env node
// Budget Tracker MCP server (stdio). Lets Claude read the budget and update
// bills, buffers and bills-account settings directly in Firestore.
// Setup: see mcp/README.md

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { listBudgets, readBudget, changeBudget, readLedger, writeMonths, writeConfig } from './firestore.js'
import { summarize, updateItems, addItem, removeItem, markPaid, updateBillsSettings, setBuffer, PAYMENT_TYPE_VALUES } from './budget.js'
import { FREQUENCIES } from '../src/lib/schedule.js'
import { importStatement, listTransactions, reviewQueue, categorise, addRule, removeRule, setAccount, spendingSummary, billsAuditSummary } from './ledger.js'
import { KIND_LABELS } from '../src/lib/import/ledger.js'
import { wealthSummary, projectionSummary, setHomeValue, setLoanSettings, setAssumptions, addPlanEvent, updatePlanEvent, removePlanEvent } from './wealth.js'
import { EVENT_TYPES } from '../src/lib/projection.js'

const server = new McpServer({ name: 'budget-tracker', version: '1.0.0' })

const ok = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const fail = (err) => ({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true })
const run = (fn) => async (args) => { try { return ok(await fn(args)) } catch (e) { return fail(e) } }

const budgetArg = z.string().optional().describe('Budget name or id. Optional when there is only one budget.')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

const itemFields = {
  name: z.string().optional(),
  amount: z.number().nonnegative().optional().describe('Amount per billing cycle (e.g. the quarterly amount for a quarterly bill)'),
  frequency: z.enum(FREQUENCIES).optional(),
  paymentType: z.enum(PAYMENT_TYPE_VALUES).optional().describe('direct_debit / standing_order / card roll over automatically; manual needs marking paid'),
  itemType: z.enum(['expense', 'saving']).optional(),
  category: z.string().optional().describe('Category name or id; a new name creates the category'),
  person: z.string().nullable().optional().describe('Person name, or "shared"'),
  fromBillsAccount: z.boolean().optional().describe('false for day-to-day spending not paid from the bills account'),
  paused: z.boolean().optional(),
  lastPaid: date.nullable().optional(),
  nextDueDate: date.nullable().optional().describe('Next due date. Auto-pay bills roll forward from this on their own'),
  subscriptionEndDate: date.nullable().optional(),
  priceChangeDate: date.nullable().optional(),
  priceChangeAmount: z.number().nullable().optional(),
  fund: z.boolean().optional().describe('true = builds up in the bills account with every transfer and is never due (e.g. a giving fund)'),
  fundStart: date.nullable().optional().describe('For funds: the date it started building'),
  fundOpening: z.number().optional().describe('For funds: the amount it started with'),
  notes: z.string().nullable().optional(),
  company: z.string().nullable().optional()
}

server.registerTool('list_budgets', {
  description: 'List the budgets in the Budget Tracker app.',
  inputSchema: {}
}, run(async () => listBudgets()))

server.registerTool('get_budget', {
  description: 'Read a budget: people, income, every expense/saving with its next due date and how much is set aside, buffers, and the Bills-tab numbers (required today, surplus, transfers). Call this before making changes.',
  inputSchema: { budget: budgetArg }
}, run(async ({ budget }) => {
  const { data } = await readBudget(budget)
  return summarize(data)
}))

server.registerTool('update_items', {
  description: 'Change one or more existing expenses/savings in a single save. Only the fields you give are changed.',
  inputSchema: {
    budget: budgetArg,
    changes: z.array(z.object({
      item: z.union([z.string(), z.number()]).describe('Item name or id'),
      set: z.object(itemFields)
    })).min(1)
  }
}, run(async ({ budget, changes }) => changeBudget(budget, (d) => updateItems(d, changes))))

server.registerTool('add_item', {
  description: 'Add a new expense (default: a bill paid from the bills account) or saving.',
  inputSchema: {
    budget: budgetArg,
    item: z.object({ ...itemFields, name: z.string(), amount: z.number().nonnegative(), frequency: z.enum(FREQUENCIES) })
  }
}, run(async ({ budget, item }) => changeBudget(budget, (d) => addItem(d, item))))

server.registerTool('remove_item', {
  description: 'Delete an expense/saving permanently. Prefer pausing (update_items paused=true) unless asked to delete.',
  inputSchema: { budget: budgetArg, item: z.union([z.string(), z.number()]) }
}, run(async ({ budget, item }) => changeBudget(budget, (d) => removeItem(d, item))))

server.registerTool('mark_paid', {
  description: 'Record that a bill was paid (moves a manual bill to its next due date).',
  inputSchema: { budget: budgetArg, item: z.union([z.string(), z.number()]), date: date.optional().describe('Defaults to today') }
}, run(async ({ budget, item, date: d }) => changeBudget(budget, (data) => markPaid(data, item, d))))

server.registerTool('update_bills_account', {
  description: 'Update the bills account: current balance, credit card owing, how bills are split, and per-person transfer options (fixed amount, % of pay, or tops up the rest).',
  inputSchema: {
    budget: budgetArg,
    balance: z.number().nullable().optional(),
    cardOwing: z.number().nullable().optional(),
    transferSplit: z.enum(['income', 'equal', 'owner', 'custom']).optional().describe('custom = set amounts + top-up'),
    people: z.array(z.object({
      person: z.string(),
      mode: z.enum(['fixed', 'percent', 'topUp']).optional(),
      fixedAmount: z.number().nullable().optional().describe('Per transfer'),
      percentOfIncome: z.number().nullable().optional(),
      followsPay: z.boolean().optional().describe('Transfer on payday')
    })).optional()
  }
}, run(async ({ budget, ...rest }) => changeBudget(budget, (d) => updateBillsSettings(d, rest))))

server.registerTool('set_buffer', {
  description: 'Add, change or remove a buffer (a fixed amount always kept in the bills account).',
  inputSchema: {
    budget: budgetArg,
    id: z.union([z.string(), z.number()]).optional(),
    description: z.string().optional(),
    amount: z.number().optional(),
    remove: z.boolean().optional()
  }
}, run(async ({ budget, ...rest }) => changeBudget(budget, (d) => setBuffer(d, rest))))

// ---------------------------------------------------------------------------
// Imported bank transactions
// ---------------------------------------------------------------------------

/** Read the ledger, run a pure change, write only what changed. */
const changeLedger = (budget, change, { dryRun = false } = {}) => (async () => {
  const ledger = await readLedger(budget)
  const { months, config, summary } = change(ledger)
  if (!dryRun) {
    await writeConfig(ledger.meta, config)
    await writeMonths(ledger.meta, months)
  }
  return { ...summary, monthsChanged: Object.keys(months).length, saved: !dryRun }
})()

const kindEnum = z.enum(Object.keys(KIND_LABELS))
const accountKind = z.enum(['transaction', 'offset', 'loan', 'card'])

server.registerTool('import_statement', {
  description: 'Import a bank/card CSV export from this computer (ING or Qantas format) into the budget. Transactions already imported are skipped. The file is read locally; only parsed transactions are saved. Use dryRun first to preview.',
  inputSchema: {
    budget: budgetArg,
    path: z.string().describe('Full path to the .csv file'),
    account: z.string().describe('Account name (existing, or a new one to create), e.g. "Spending"'),
    accountKind: accountKind.optional().describe('For a new account'),
    number: z.string().optional().describe('Account number, so transfers to it pair up'),
    repaymentMatch: z.string().optional().describe('For a card: text in its repayment description, e.g. "QANTAS"'),
    dryRun: z.boolean().optional()
  }
}, run(async ({ budget, path, dryRun, ...opts }) => {
  if (!/\.csv$/i.test(path)) throw new Error('Only .csv files can be imported.')
  const text = await readFile(path, 'utf8')
  return changeLedger(budget, (l) => importStatement(l, text, { ...opts, filename: path.split(/[\\/]/).pop() }), { dryRun })
}))

server.registerTool('list_transactions', {
  description: 'Search imported transactions. Amounts are negative for money out.',
  inputSchema: {
    budget: budgetArg,
    from: date.optional(), to: date.optional(),
    account: z.string().optional(), kind: kindEnum.optional(), category: z.string().optional(),
    search: z.string().optional().describe('Text in payee, description or note'),
    needsReview: z.boolean().optional(),
    limit: z.number().int().positive().max(500).optional()
  }
}, run(async ({ budget, ...f }) => listTransactions(await readLedger(budget), f)))

server.registerTool('review_queue', {
  description: 'Transactions that need a category (or are transfers to unknown accounts), grouped by payee, biggest first. Ask the user about unclear ones, then use categorise_transactions.',
  inputSchema: { budget: budgetArg, limit: z.number().int().positive().max(200).optional(), from: date.optional() }
}, run(async ({ budget, ...o }) => reviewQueue(await readLedger(budget), o)))

server.registerTool('categorise_transactions', {
  description: 'Set the category and/or kind of transactions, picked by ids or payee (merchant). remember=true saves a rule for that payee so future imports are handled too.',
  inputSchema: {
    budget: budgetArg,
    ids: z.array(z.string()).optional(),
    merchant: z.string().optional(),
    category: z.string().nullable().optional(),
    kind: kindEnum.optional().describe('e.g. transfer (between own accounts), debt_repayment, refund, income, spend'),
    remember: z.boolean().optional()
  }
}, run(async ({ budget, ...o }) => changeLedger(budget, (l) => categorise(l, o))))

server.registerTool('add_rule', {
  description: 'Add a categorisation rule. Newest rules win. Applies to all imported transactions now and future imports.',
  inputSchema: {
    budget: budgetArg,
    field: z.enum(['merchant', 'rawDesc', 'label']).optional(),
    op: z.enum(['equals', 'contains', 'regex']).optional(),
    value: z.string(),
    category: z.string().nullable().optional(),
    kind: kindEnum.optional(),
    account: z.string().optional().describe('Only for this account'),
    direction: z.enum(['in', 'out']).optional().describe('Only money in, or only money out')
  }
}, run(async ({ budget, ...o }) => changeLedger(budget, (l) => addRule(l, o))))

server.registerTool('list_rules', {
  description: 'List categorisation rules and accounts.',
  inputSchema: { budget: budgetArg }
}, run(async ({ budget }) => (await readLedger(budget)).config))

server.registerTool('remove_rule', {
  description: 'Delete a categorisation rule by id.',
  inputSchema: { budget: budgetArg, id: z.string() }
}, run(async ({ budget, id }) => changeLedger(budget, (l) => removeRule(l, id))))

server.registerTool('set_account', {
  description: 'Add or update an account used for imports (name, kind, account number, card repayment text).',
  inputSchema: {
    budget: budgetArg,
    account: z.string().describe('Existing account name/id, or a new name'),
    name: z.string().optional(), kind: accountKind.optional(),
    number: z.string().nullable().optional(), repaymentMatch: z.string().nullable().optional()
  }
}, run(async ({ budget, ...o }) => changeLedger(budget, (l) => setAccount(l, o))))

server.registerTool('spending_summary', {
  description: 'Spending by category and total income between two dates (transfers, card repayments and loan payments excluded).',
  inputSchema: { budget: budgetArg, from: date.optional(), to: date.optional() }
}, run(async ({ budget, ...o }) => spendingSummary(await readLedger(budget), o)))

server.registerTool('bills_audit', {
  description: 'Compare the budget bills with imported bank data: which match, which changed (with suggested amount/frequency/next due), which look cancelled, regular payments missing from the budget, and how the bills account actually moved over 12 months. Read-only — apply changes with update_items/add_item after the user agrees.',
  inputSchema: { budget: budgetArg }
}, run(async ({ budget }) => {
  const [ledger, { data }] = await Promise.all([readLedger(budget), readBudget(budget)])
  return billsAuditSummary(ledger, data, { today: new Date().toISOString().slice(0, 10) })
}))

// ---------------------------------------------------------------------------
// Wealth, mortgage and plans
// ---------------------------------------------------------------------------

const todayStr = () => new Date().toISOString().slice(0, 10)
const ymArg = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM')

server.registerTool('get_wealth', {
  description: 'Net worth now (home, cash, mortgage per loan with rate/repayment/payoff, other debts), assumptions and planned events.',
  inputSchema: { budget: budgetArg }
}, run(async ({ budget }) => {
  const [ledger, { data }] = await Promise.all([readLedger(budget), readBudget(budget)])
  return wealthSummary(ledger, data, { today: todayStr() })
}))

server.registerTool('get_projection', {
  description: 'Project cash, mortgage and net worth forward from real income/spending plus planned events: next 3 years by quarter, long view every 5 years, payoff dates and cash shortfall warnings.',
  inputSchema: { budget: budgetArg, withPlans: z.boolean().optional().describe('false = baseline without planned events') }
}, run(async ({ budget, withPlans }) => {
  const [ledger, { data }] = await Promise.all([readLedger(budget), readBudget(budget)])
  return projectionSummary(ledger, data, { today: todayStr(), withPlans: withPlans !== false })
}))

server.registerTool('set_home_value', {
  description: 'Record an estimate of the home value (used for net worth and equity).',
  inputSchema: { budget: budgetArg, value: z.number().positive(), date: date.optional().describe('Defaults to today') }
}, run(async ({ budget, value, date: d }) => changeBudget(budget, (data) => setHomeValue(data, { value, date: d || todayStr() }))))

server.registerTool('set_loan', {
  description: 'Override a loan\'s interest rate (%) or repayment, or set which account offsets it. null clears an override.',
  inputSchema: {
    budget: budgetArg, loan: z.string().describe('Loan account name or id'),
    rate: z.number().nullable().optional().describe('Yearly %, e.g. 5.84'), repayment: z.number().nullable().optional(),
    offsetAccount: z.string().nullable().optional()
  }
}, run(async ({ budget, ...o }) => {
  const ledger = await readLedger(budget)
  return changeBudget(budget, (data) => setLoanSettings(data, ledger.config.accounts, o))
}))

server.registerTool('set_assumptions', {
  description: 'Projection assumptions: yearly % growth for pay, prices and home value; income source (actual bank data or budget salaries); optional fixed income/spending per month (null = use actual).',
  inputSchema: {
    budget: budgetArg, salaryGrowth: z.number().optional(), inflation: z.number().optional(), homeGrowth: z.number().optional(),
    incomeSource: z.enum(['actual', 'budget']).optional(), incomePerMonth: z.number().nullable().optional(), spendingPerMonth: z.number().nullable().optional()
  }
}, run(async ({ budget, ...o }) => changeBudget(budget, (data) => setAssumptions(data, o))))

const eventFields = {
  name: z.string().optional(),
  date: ymArg.optional(), endDate: ymArg.optional(),
  amount: z.number().optional().describe('Effect on cash: negative = cost, positive = money in (extra_repayment/lump_sum: positive amount paid)'),
  person: z.string().optional().describe('Person name, for income_change and leave'),
  percent: z.number().optional().describe('income_change: % pay change'),
  percentOfPay: z.number().optional().describe('leave: % of pay received while off'),
  rate: z.number().optional().describe('rate_change: new yearly rate in %'),
  loanId: z.string().optional(), enabled: z.boolean().optional()
}

server.registerTool('add_plan_event', {
  description: 'Add a planned life event to the projection. Types: ' + Object.entries(EVENT_TYPES).map(([k, v]) => k + ' (' + v.help + ')').join('; '),
  inputSchema: { budget: budgetArg, type: z.enum(Object.keys(EVENT_TYPES)), ...eventFields, date: ymArg }
}, run(async ({ budget, ...e }) => changeBudget(budget, (data) => addPlanEvent(data, e))))

server.registerTool('update_plan_event', {
  description: 'Change a planned event (by id from get_wealth). Only the fields given change.',
  inputSchema: { budget: budgetArg, id: z.string(), type: z.enum(Object.keys(EVENT_TYPES)).optional(), ...eventFields }
}, run(async ({ budget, id, ...patch }) => changeBudget(budget, (data) => updatePlanEvent(data, id, patch))))

server.registerTool('remove_plan_event', {
  description: 'Delete a planned event by id.',
  inputSchema: { budget: budgetArg, id: z.string() }
}, run(async ({ budget, id }) => changeBudget(budget, (data) => removePlanEvent(data, id))))

await server.connect(new StdioServerTransport())
