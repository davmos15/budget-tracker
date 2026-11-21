// Give each transaction a spending category. Pure functions only.
//
// First match wins:
//   1. category set by hand (source 'manual') — never touched
//   2. your rules (may also change kind, e.g. a credit that's really a refund)
//   3. built-in Australian merchant list
//   4. the bank's own category (Qantas card)
//   5. nothing → needs review (category null)
//
// Rule: { id, match: { field: 'merchant'|'rawDesc'|'label', op: 'equals'|'contains'|'regex', value },
//         accountId?, direction?: 'in'|'out', set: { category?, kind? } }

export const DEFAULT_CATEGORIES = [
  { name: 'Groceries', color: '#16a34a' },
  { name: 'Cafes & coffee', color: '#a16207' },
  { name: 'Restaurants & takeaway', color: '#ea580c' },
  { name: 'Alcohol', color: '#9f1239' },
  { name: 'Shopping', color: '#db2777' },
  { name: 'Clothing', color: '#c026d3' },
  { name: 'Home & garden', color: '#65a30d' },
  { name: 'Electronics', color: '#4f46e5' },
  { name: 'Health & medical', color: '#059669' },
  { name: 'Personal care', color: '#f472b6' },
  { name: 'Fitness', color: '#0d9488' },
  { name: 'Childcare', color: '#f59e0b' },
  { name: 'Kids', color: '#fbbf24' },
  { name: 'Education', color: '#7c3aed' },
  { name: 'Public transport', color: '#0284c7' },
  { name: 'Fuel', color: '#dc2626' },
  { name: 'Car', color: '#b91c1c' },
  { name: 'Parking & tolls', color: '#f87171' },
  { name: 'Utilities', color: '#6366f1' },
  { name: 'Phone & internet', color: '#818cf8' },
  { name: 'Insurance', color: '#14b8a6' },
  { name: 'Rates & strata', color: '#0ea5e9' },
  { name: 'Subscriptions & media', color: '#8b5cf6' },
  { name: 'Entertainment', color: '#f97316' },
  { name: 'Travel', color: '#06b6d4' },
  { name: 'Gifts & donations', color: '#e11d48' },
  { name: 'Services', color: '#64748b' },
  { name: 'Fees & interest', color: '#475569' },
  { name: 'Tax', color: '#334155' },
  { name: 'Cash', color: '#78716c' },
  { name: 'Income', color: '#22c55e' },
  { name: 'Gifts received', color: '#4ade80' },
  { name: 'Reimbursements', color: '#86efac' },
  { name: 'Government', color: '#15803d' },
  { name: 'Card (unitemised)', color: '#94a3b8' },
  { name: 'Other', color: '#a8a29e' }
]

// [pattern tested against "merchant rawDesc", category, kind?]
const B = [
  [/\b(COLES|WOOLWORTHS|WOOLIES|ALDI|IGA|FOODWORKS|HARRIS FARM|COSTCO|FRUIT PALACE|SUPA ?IGA|KOSHER|GLICKS|TAMAR|FOOD ?LAND)\b/i, 'Groceries'],
  [/\b(BAKERY|BAKEHOUSE|BUTCHER|FRUIT|GREENGROCER|DELI)\b/i, 'Groceries'],
  [/\b(CAFE|CAFFE|COFFEE|ESPRESSO|ROASTERS?|STARBUCKS|GLORIA JEAN)\b/i, 'Cafes & coffee'],
  [/\b(MCDONALD|KFC|HUNGRY JACK|DOMINO|PIZZA|SUSHI|UBER ?EATS|DOORDASH|MENULOG|DELIVEROO|RESTAURANT|GRILL|BURGER|NANDO|GUZMAN|SUBWAY|ZAMBRERO|THAI|KEBAB|FALAFEL)\b/i, 'Restaurants & takeaway'],
  [/\b(DAN MURPHY|BWS|LIQUOR|BOTTLE ?SHOP|FIRST CHOICE|VINTAGE CELLARS)\b/i, 'Alcohol'],
  [/\b(KMART|TARGET|BIG W|MYER|DAVID JONES|AMAZON|EBAY|CATCH|TEMU|SHEIN|OFFICEWORKS|SPOTLIGHT|VINTED|NEWSAGENCY|AUSTRALIA POST|AUSPOST|DEPOP|ETSY|THE ICONIC)\b/i, 'Shopping'],
  [/\b(UNIQLO|COTTON ON|H ?& ?M|ZARA|COUNTRY ROAD|SPORTSGIRL|RIVERS|BONDS|PETER ALEXANDER|NIKE|ADIDAS|ATHLETES FOOT|PLATYPUS|LULULEMON|GLUE|SEED HERITAGE)\b/i, 'Clothing'],
  [/\b(BUNNINGS|IKEA|FREEDOM|ADAIRS|BED BATH|PILLOW TALK|TEMPLE ?& ?WEBSTER|MITRE 10|HOME HARDWARE|NURSERY)\b/i, 'Home & garden'],
  [/\b(JB HI|HARVEY NORMAN|THE GOOD GUYS|APPLE STORE|APPLE\.COM\/AU|DICK SMITH)\b/i, 'Electronics'],
  [/\b(CHEMIST|PHARMACY|PRICELINE|MEDICAL|DOCTOR|CLINIC|DENTAL|DENTIST|PHYSIO\w*|PATHOLOGY|RADIOLOGY|HOSPITAL|PSYCH\w*|OPTOM\w*|SPECSAVERS|MCARE|MEDICARE|HCF\w*|BUPA|MEDIBANK|NIB|HEALTH FUND|IMAGING|GP|OBSTETRIC\w*|PAEDIATRIC\w*|ULTRASOUND|DR)\b/i, 'Health & medical'],
  [/\b(HAIR|BARBER|SALON|BEAUTY|NAILS?|LASH|BROW|SKIN|MECCA|SEPHORA|MASSAGE)\b/i, 'Personal care'],
  [/\b(GYM|FITNESS|YOGA|PILATES|F45|ANYTIME|CROSSFIT|SWIM|STRAVA|GARMIN)\b/i, 'Fitness'],
  [/\b(ONLY ABOUT CHILD|CHILDCARE|CHILD CARE|CRECHE|KINDER|EARLY LEARNING|GOODSTART|OSHC|CCS PAYMENT)\b/i, 'Childcare'],
  [/\b(BABY BUNTING|TOYS|LEGO|KIDSTUFF|SMIGGLE|PUMPKIN PATCH)\b/i, 'Kids'],
  [/\b(UNIVERSITY|UNI |SCHOOL|TAFE|RMIT|MONASH|UDEMY|COURSERA)\b/i, 'Education'],
  [/\b(MYKI|OPAL|PTV|METRO TRAINS|UBER(?! ?EATS)|DIDI|OLA|TAXI|13CABS|LIME)\b/i, 'Public transport'],
  [/\b(SHELL|BP|CALTEX|AMPOL|7-ELEVEN|7-11|UNITED PETROLEUM|LIBERTY|METRO PETROLEUM|PETROL|EG AUSFUEL|EG GROUP)\b/i, 'Fuel'],
  [/\b(VICROADS|REGO|SERVICE ?NSW|MECHANIC|AUTOBARN|SUPERCHEAP|REPCO|TYRE|CAR WASH|NOVATED|SMARTSALARY|ULTRA TUNE)\b/i, 'Car'],
  [/\b(PARKING|WILSON PARK|SECURE PARK|CARE PARK|LINKT|CITYLINK|EASTLINK|E-TOLL|PARKMATE|EASYPARK|CELLOPARK)\b/i, 'Parking & tolls'],
  [/\b(POWERSHOP|OVO ENERGY|AGL|ORIGIN|ENERGY ?AUSTRALIA|RED ENERGY|ALINTA|SIMPLY ENERGY|LUMO|MOMENTUM|SEW WATER|SOUTH EAST WATER|YARRA VALLEY WATER|CITY WEST WATER|WATER BILL|GAS)\b/i, 'Utilities'],
  [/\b(TELSTRA|OPTUS|VODAFONE|TPG|IINET|AUSSIE BROADBAND|EXETEL|TANGERINE|BELONG|AMAYSIM|BOOST|LEBARA|SUPERLOOP|FELIX MOBILE|CIRCLES)\b/i, 'Phone & internet'],
  [/\b(BUDGET DIRECT|AAMI|RACV|NRMA|ALLIANZ|YOUI|QBE|SUNCORP|GIO|INSURANCE|COMMINSURE|TAL LIFE|AIA)\b/i, 'Insurance'],
  [/\b(RATES|COUNCIL|OWNERS CORP|BODY CORP|STRATA)\b/i, 'Rates & strata'],
  [/\b(GOOGLE ONE|AMZNPRIME\w*|NETFLIX|SPOTIFY|DISNEY|STAN|BINGE|KAYO|YOUTUBE|APPLE\.COM\/BILL|ITUNES|GOOGLE ?\*|GOOGLE PLAY|AUDIBLE|PRIME VIDEO|AMAZON PRIME|PATREON|CHATGPT|OPENAI|ANTHROPIC|CLAUDE\.AI|MICROSOFT|ADOBE|DROPBOX|PARAMOUNT|FOXTEL|NYTIMES|THE AGE)\b/i, 'Subscriptions & media'],
  [/\b(CINEMAS?|HOYTS|PALACE|TICKETEK\w*|TICKETMASTER\w*|EVENTBRITE|MOSHTIX|ZOO|MUSEUM|AQUARIUM|BOWLING|TIMEZONE|SCIENCEWORKS)\b/i, 'Entertainment'],
  [/\b(QANTAS|VIRGIN AUST|JETSTAR|REX AIRLINES|AIRBNB|BOOKING\.COM|EXPEDIA|HOTEL|MOTEL|AGODA|WOTIF|TRIP\.COM|AIRPORT|EL AL|EMIRATES|SKYBUS|HERTZ|AVIS|EUROPCAR|THRIFTY)\b/i, 'Travel'],
  [/\b(DONATION|CHARITY|GIVE|SHUL|SYNAGOGUE|CHABAD|JNF|UIA|KEREN|TZEDAKAH|RED CROSS|SALVATION|GOFUNDME)\b/i, 'Gifts & donations'],
  [/\b(CLEANER|CLEANING|PLUMB|ELECTRICIAN|LOCKSMITH|AIRTASKER|HIPAGES|LAUNDROMAT|DRY CLEAN)\b/i, 'Services'],
  [/\b(ATMX?|CASHCARD|CASH OUT|WITHDRAWAL)\b/i, 'Cash'],
  [/\b(INTEREST CHARGE|ANNUAL FEE|ATM OWNER FEE|INTERNATIONAL TRANSACTION FEE|LATE FEE|ACCOUNT FEE)\b/i, 'Fees & interest'],
  [/\b(ATO|TAX OFFICE|HECS)\b/i, 'Tax'],
  [/\b(SALARY|PAYROLL|WAGES|PAY ?RUN)\b/i, 'Income'],
  [/\b(CCS PAYMENT|CENTRELINK|SERVICES AUSTRALIA|FAMILY TAX)\b/i, 'Government']
]
export const BUILTIN_RULES = B.map(([re, category, kind]) => ({ re, category, kind }))

// Medicare / health-fund rebates are refunds of health spending, not income
const HEALTH_REBATE = /\b(MCARE|MEDICARE|HCF\w*|BUPA|MEDIBANK|NIB)\b/i

// Qantas card categories → ours
export const BANK_CATEGORY_MAP = {
  'Cafe & coffee': 'Cafes & coffee',
  'Groceries': 'Groceries',
  'Other shopping': 'Shopping',
  'Medical': 'Health & medical',
  'Restaurants & takeaway': 'Restaurants & takeaway',
  'Clothing & accessories': 'Clothing',
  'Attractions & events': 'Entertainment',
  'Services': 'Services',
  'Personal care': 'Personal care',
  'Parking & tolls': 'Parking & tolls',
  'Fuel': 'Fuel',
  'Public transport': 'Public transport',
  'Gym & fitness': 'Fitness',
  'Vehicle expenses': 'Car',
  'Media': 'Subscriptions & media',
  'Home improvements': 'Home & garden',
  'Homeware': 'Home & garden',
  'Travel expenses': 'Travel',
  'Accommodation': 'Travel',
  'Fees': 'Fees & interest',
  'Electronics & technology': 'Electronics',
  'Insurance': 'Insurance',
  'Alcohol': 'Alcohol',
  'Hobbies': 'Entertainment',
  'Gifts': 'Gifts & donations',
  'Cash': 'Cash',
  'Education': 'Education',
  'Utilities': 'Utilities',
  'Telecommunications': 'Phone & internet'
}

// Kinds that show up in spending/income and so need a category
const COUNTED = new Set(['spend', 'income', 'refund', 'fee', 'redraw_spend'])

export function matchRule(rule, t) {
  if (rule.accountId && rule.accountId !== t.accountId) return false
  if (rule.direction === 'in' && t.amount < 0) return false
  if (rule.direction === 'out' && t.amount > 0) return false
  const { field = 'merchant', op = 'equals', value } = rule.match || {}
  if (value === undefined || value === null || value === '') return false
  const have = String(t[field] ?? '').toLowerCase()
  const want = String(value).toLowerCase()
  if (op === 'equals') return have === want
  if (op === 'contains') return have.includes(want)
  if (op === 'regex') {
    try { return new RegExp(value, 'i').test(String(t[field] ?? '')) } catch { return false }
  }
  return false
}

function categoriseOne(t, rules) {
  if (t.kind === 'card_unitemised') return { ...t, category: t.source === 'manual' ? t.category : 'Card (unitemised)', source: t.source === 'manual' ? 'manual' : 'builtin' }
  if (t.source === 'manual') return t
  if (t.ruleId) { t = { ...t }; delete t.ruleId } // re-decided below

  const rule = rules.find(r => matchRule(r, t))
  if (rule) {
    const kind = rule.set?.kind && !t.kindLocked ? rule.set.kind : t.kind
    if (rule.set?.category !== undefined || rule.set?.kind) {
      const out = { ...t, kind, ruleId: rule.id }
      if (!COUNTED.has(kind)) { delete out.category; out.source = 'rule'; return out }
      if (rule.set?.category !== undefined) return { ...out, category: rule.set.category, source: 'rule' }
      t = out // kind only: carry on to find a category
    }
  }
  if (!COUNTED.has(t.kind)) {
    const out = { ...t }
    delete out.category; delete out.source
    return out
  }

  const text = `${t.merchant || ''} ${t.rawDesc || ''}`
  if (t.amount > 0 && t.kind === 'income' && HEALTH_REBATE.test(text)) {
    return { ...t, kind: t.kindLocked ? t.kind : 'refund', category: 'Health & medical', source: 'builtin' }
  }
  const builtin = BUILTIN_RULES.find(b => b.re.test(text))
  if (builtin) return { ...t, category: builtin.category, source: 'builtin', ...(builtin.kind && !t.kindLocked ? { kind: builtin.kind } : {}) }

  const mapped = t.bankCategory && BANK_CATEGORY_MAP[t.bankCategory]
  if (mapped) return { ...t, category: mapped, source: 'bank' }

  return { ...t, category: null, source: null }
}

/** Returns new transaction objects with category / source (and possibly kind) set. */
export function categoriseAll(txns, rules = []) {
  return txns.map(t => categoriseOne(t, rules))
}
