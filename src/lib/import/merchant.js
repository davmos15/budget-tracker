// Pull useful bits out of bank descriptions. Pure functions only.

/** ING receipt number, shared by both sides of an internal transfer. */
export function extractReceipt(desc) {
  const m = /Receipt(?: No)?\s+(\d{4,})/i.exec(desc || '')
  return m ? m[1] : null
}

/**
 * The other account in a transfer, as its last 8 digits:
 *   "... Orange Everyday 0011112222", "... From 0011112222", "... Transfer to 923100 33334444",
 *   "... To 923100 009999999"
 */
export function extractCounterparty(desc) {
  const m = /(?:Everyday|Maximiser|Saver|Offset|From|Transfer to|\bTo\s+\d{6})\s+(?:\d{6}\s+)?(\d{8,10})(?!\d)/i.exec(desc || '')
  return m ? m[1].slice(-8) : null
}

/** The note typed on a transfer: the text before " - Internal Transfer" / " - Receipt". */
export function transferLabel(desc) {
  const s = String(desc || '')
  const m = /^(.*?)\s+-\s+(?:Internal Transfer|Receipt)/i.exec(s)
  return (m ? m[1] : s).trim()
}

const PROCESSORS = /^(SQ \*|SQ\*|PAYPAL \*|PAYPAL\*|PP\*|ZLR\*|SP \*|SMP\*|LS\*|IZ \*|GPAY\*)\s*/i
const GENERIC_MERCHANT_NAMES = new Set(['square', 'paypal', 'paypal australia', 'zeller', 'stripe', 'tyro'])

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

/** A short, stable merchant name for grouping and rules. */
export function cleanMerchant(rawDesc, merchantName) {
  if (merchantName && !GENERIC_MERCHANT_NAMES.has(merchantName.trim().toLowerCase())) {
    return merchantName.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  }
  let s = String(rawDesc || '')
  // ING: "MERCHANT - Visa Purchase - Receipt ..." → "MERCHANT"
  s = s.split(/\s+-\s+/)[0]
  s = s.replace(PROCESSORS, '')
  s = s.replace(/\b\d{3,}\b/g, ' ')         // card/ref numbers
  s = s.replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{5,}\b/gi, ' ') // reference codes like P48C4CB5BD
  s = s.replace(/\s+(AUS|AU|NSW|VIC|QLD|SA|WA|TAS|ACT|NT)$/i, '')
  s = s.replace(/[*#\\]+/g, ' ').replace(/\s+/g, ' ').trim()
  return titleCase(s) || 'Unknown'
}

/** The biller named on an ING BPAY payment ("... BPAY Bill Payment - Receipt 1 To GLEN EIRA COUN"). */
export function bpayBiller(desc) {
  const m = /BPAY.*?\bTo\s+(.+)$/i.exec(desc || '')
  return m ? m[1].trim().replace(/\s+/g, ' ').toUpperCase() : null
}
