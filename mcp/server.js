#!/usr/bin/env node
// Budget Tracker MCP server (stdio). Lets Claude read the budget and update
// bills, buffers and bills-account settings directly in Firestore.
// Setup: see mcp/README.md

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { listBudgets, readBudget, changeBudget } from './firestore.js'
import { summarize, updateItems, addItem, removeItem, markPaid, updateBillsSettings, setBuffer, PAYMENT_TYPE_VALUES } from './budget.js'
import { FREQUENCIES } from '../src/lib/schedule.js'

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

await server.connect(new StdioServerTransport())
