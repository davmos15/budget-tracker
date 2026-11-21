// Turn bank/card CSV exports into plain rows. Pure functions only.
//
// Supported:
//   ING (Orange Everyday / offset / loans):  Date,Description,Credit,Debit,Balance   (DD/MM/YYYY)
//   Qantas Money credit card:  Date,Amount,Account Number,,Transaction Type,Transaction Details,
//                              Category,Merchant Name,Processed On                  (DD Mon YY)
//
// Row: { date: 'YYYY-MM-DD', amount (+ = money in), rawDesc, balance?, bankCategory?, merchantName?, txType? }

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const round2 = (n) => Math.round(n * 100) / 100
const BOM = new RegExp('^' + String.fromCharCode(0xfeff))

/** Split CSV text into rows of fields (handles quotes, "" escapes, CRLF). */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

export function detectFormat(header) {
  const h = (header || []).map(x => String(x).trim().toLowerCase())
  if (h[0] === 'date' && ['description', 'credit', 'debit', 'balance'].every(k => h.includes(k))) return 'ing'
  if (h.includes('transaction details') && h.includes('amount') && h.includes('date')) return 'qantas'
  return null
}

function validDate(y, m, d) {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function ingDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [d, mo, y] = [+m[1], +m[2], +m[3]]
  return validDate(y, mo, d) ? iso(y, mo, d) : null
}

function qantasDate(s) {
  const m = /^(\d{1,2}) ([A-Za-z]{3,9}) (\d{2}|\d{4})$/.exec(s.trim())
  if (!m) return null
  // "Sep", "Sept" and "September" all appear in exports
  const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  const d = +m[1]
  return mo && validDate(y, mo, d) ? iso(y, mo, d) : null
}

function num(s) {
  const t = String(s ?? '').replace(/[$,\s]/g, '')
  if (t === '') return 0
  const n = Number(t)
  return isFinite(n) ? n : NaN
}

function parseIng(cells, col) {
  const date = ingDate(cells[col.date] || '')
  if (!date) return { error: 'bad date' }
  const credit = num(cells[col.credit])
  const debit = num(cells[col.debit])
  const balance = num(cells[col.balance])
  if ([credit, debit, balance].some(Number.isNaN)) return { error: 'bad amount' }
  // Debits are already negative in ING exports; be safe if they're not
  const amount = round2(Math.abs(credit) - Math.abs(debit))
  const row = { date, amount, rawDesc: (cells[col.description] || '').trim() }
  if (String(cells[col.balance] ?? '').trim() !== '') row.balance = round2(balance)
  return { row }
}

function parseQantas(cells, col) {
  const date = qantasDate(cells[col.date] || '')
  if (!date) return { error: 'bad date' }
  const amount = num(cells[col.amount])
  if (Number.isNaN(amount)) return { error: 'bad amount' }
  const row = { date, amount: round2(amount), rawDesc: (cells[col['transaction details']] || '').trim() }
  const cat = (cells[col.category] || '').trim()
  const merchant = (cells[col['merchant name']] || '').trim()
  const type = (cells[col['transaction type']] || '').trim()
  if (cat) row.bankCategory = cat
  if (merchant) row.merchantName = merchant
  if (type) row.txType = type
  return { row }
}

/** Parse a whole export. Returns { format, rows, errors: [{ line, reason, text }] }. */
export function parseStatement(text) {
  const all = parseCsv(String(text || '').replace(BOM, ''))
  if (all.length === 0) return { format: null, rows: [], errors: [{ line: 1, reason: 'The file is empty' }] }
  const header = all[0]
  const format = detectFormat(header)
  if (!format) {
    return {
      format: null, rows: [],
      errors: [{ line: 1, reason: 'Unrecognised file. Expected an ING export (Date,Description,Credit,Debit,Balance) or a Qantas card export.' }]
    }
  }
  const col = {}
  header.forEach((h, i) => { const k = String(h).trim().toLowerCase(); if (k && !(k in col)) col[k] = i })
  const parseRow = format === 'ing' ? parseIng : parseQantas
  const rows = []
  const errors = []
  all.slice(1).forEach((cells, i) => {
    const { row, error } = parseRow(cells, col)
    if (row) rows.push(row)
    else errors.push({ line: i + 2, reason: error, text: cells.join(',').slice(0, 120) })
  })
  return { format, rows, errors }
}
