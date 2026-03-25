import { useState } from 'react'
import {
  ArrowRight, ArrowLeft, Check, Plus, Trash2, X,
  LayoutDashboard, Receipt, CreditCard, Calculator, Settings,
  Wallet, TrendingUp, PiggyBank, Sparkles
} from 'lucide-react'

const COMMON_EXPENSES = [
  // Housing
  { name: 'Rent / Mortgage', amount: 1200, frequency: 'monthly', category: 'Housing', enabled: true },
  { name: 'Council Tax', amount: 150, frequency: 'monthly', category: 'Housing', enabled: false },
  { name: 'Home Insurance', amount: 30, frequency: 'monthly', category: 'Insurance', enabled: false },
  { name: 'Contents Insurance', amount: 15, frequency: 'monthly', category: 'Insurance', enabled: false },
  // Utilities
  { name: 'Electricity', amount: 80, frequency: 'monthly', category: 'Utilities', enabled: true },
  { name: 'Gas', amount: 60, frequency: 'monthly', category: 'Utilities', enabled: true },
  { name: 'Water', amount: 35, frequency: 'monthly', category: 'Utilities', enabled: true },
  { name: 'Internet / Broadband', amount: 35, frequency: 'monthly', category: 'Utilities', enabled: true },
  { name: 'Mobile Phone', amount: 30, frequency: 'monthly', category: 'Utilities', enabled: true },
  // Transportation
  { name: 'Car Payment / Finance', amount: 250, frequency: 'monthly', category: 'Transportation', enabled: false },
  { name: 'Car Insurance', amount: 80, frequency: 'monthly', category: 'Insurance', enabled: false },
  { name: 'Fuel / Petrol', amount: 50, frequency: 'weekly', category: 'Transportation', enabled: false },
  { name: 'Public Transport', amount: 100, frequency: 'monthly', category: 'Transportation', enabled: false },
  { name: 'Parking', amount: 50, frequency: 'monthly', category: 'Transportation', enabled: false },
  // Food
  { name: 'Groceries', amount: 80, frequency: 'weekly', category: 'Food', enabled: true },
  { name: 'Dining Out', amount: 50, frequency: 'monthly', category: 'Food', enabled: false },
  { name: 'Coffee / Takeaway', amount: 15, frequency: 'weekly', category: 'Food', enabled: false },
  // Subscriptions
  { name: 'Netflix / Streaming', amount: 13, frequency: 'monthly', category: 'Subscriptions', enabled: true },
  { name: 'Spotify / Music', amount: 11, frequency: 'monthly', category: 'Subscriptions', enabled: false },
  { name: 'Amazon Prime', amount: 9, frequency: 'monthly', category: 'Subscriptions', enabled: false },
  { name: 'Cloud Storage (iCloud/Google)', amount: 3, frequency: 'monthly', category: 'Subscriptions', enabled: false },
  { name: 'Gym Membership', amount: 35, frequency: 'monthly', category: 'Health', enabled: false },
  // Health
  { name: 'Health Insurance', amount: 50, frequency: 'monthly', category: 'Health', enabled: false },
  { name: 'Dental Plan', amount: 15, frequency: 'monthly', category: 'Health', enabled: false },
  // Entertainment
  { name: 'Hobbies', amount: 50, frequency: 'monthly', category: 'Entertainment', enabled: false },
  { name: 'Going Out', amount: 40, frequency: 'monthly', category: 'Entertainment', enabled: false },
  // Savings
  { name: 'Emergency Fund', amount: 100, frequency: 'monthly', category: 'Savings', enabled: false, isSaving: true },
  { name: 'Holiday Fund', amount: 50, frequency: 'monthly', category: 'Savings', enabled: false, isSaving: true },
  { name: 'Retirement / Pension', amount: 200, frequency: 'monthly', category: 'Savings', enabled: false, isSaving: true },
  // Insurance
  { name: 'Life Insurance', amount: 25, frequency: 'monthly', category: 'Insurance', enabled: false },
  // Personal
  { name: 'Clothing', amount: 50, frequency: 'monthly', category: 'Entertainment', enabled: false },
  { name: 'Haircuts / Personal Care', amount: 30, frequency: 'monthly', category: 'Health', enabled: false },
  { name: 'Pet Expenses', amount: 40, frequency: 'monthly', category: 'Food', enabled: false },
  { name: 'Childcare', amount: 500, frequency: 'monthly', category: 'Housing', enabled: false },
]

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'income', title: 'Income' },
  { id: 'expenses', title: 'Expenses' },
  { id: 'done', title: 'All Set' },
]

export default function OnboardingFlow({ user, categories, settings, onComplete }) {
  const [step, setStep] = useState(0)
  const currency = settings.currency || '$'

  // Income state
  const [incomes, setIncomes] = useState([
    { id: 1, source: 'Main Salary', amount: '', frequency: 'monthly', personName: user?.displayName?.split(' ')[0] || 'Me' }
  ])

  // Expenses state - clone COMMON_EXPENSES so user can toggle/edit
  const [expenseItems, setExpenseItems] = useState(
    COMMON_EXPENSES.map((e, i) => ({ ...e, id: i + 1 }))
  )
  const [customExpense, setCustomExpense] = useState({ name: '', amount: '', frequency: 'monthly', category: 'Utilities' })

  const categoryNames = [...new Set(COMMON_EXPENSES.map(e => e.category))]

  const nextStep = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  const handleFinish = () => {
    const selectedExpenses = expenseItems
      .filter(e => e.enabled)
      .map(e => {
        const cat = categories.find(c => c.name === e.category)
        return {
          id: Date.now() + Math.random(),
          name: e.name,
          amount: parseFloat(e.amount) || 0,
          frequency: e.frequency,
          categoryId: cat?.id || categories[0]?.id || 1,
          personId: 1,
          itemType: e.isSaving ? 'saving' : 'expense',
          paymentType: 'direct_debit'
        }
      })

    const salaryEntries = incomes
      .filter(inc => inc.amount && parseFloat(inc.amount) > 0)
      .map(inc => ({
        id: Date.now() + Math.random(),
        personId: 1,
        source: inc.source,
        amount: parseFloat(inc.amount),
        frequency: inc.frequency,
        payScheduleType: 'dayOfMonth',
        payDayOfMonth: 25
      }))

    // Add Savings category if any saving items selected and not already present
    let updatedCategories = [...categories]
    const hasSavingsCategory = categories.some(c => c.name === 'Savings')
    if (!hasSavingsCategory && selectedExpenses.some(e => e.itemType === 'saving')) {
      const newCat = { id: Date.now(), name: 'Savings', color: '#22c55e' }
      updatedCategories.push(newCat)
      selectedExpenses.forEach(e => {
        if (e.itemType === 'saving') {
          e.categoryId = newCat.id
        }
      })
    }

    onComplete({ expenses: selectedExpenses, salaries: salaryEntries, categories: updatedCategories })
  }

  const toggleExpense = (id) => {
    setExpenseItems(items => items.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e))
  }

  const updateExpenseAmount = (id, amount) => {
    setExpenseItems(items => items.map(e => e.id === id ? { ...e, amount: parseFloat(amount) || e.amount } : e))
  }

  const updateExpenseFrequency = (id, frequency) => {
    setExpenseItems(items => items.map(e => e.id === id ? { ...e, frequency } : e))
  }

  const addCustomExpense = () => {
    if (!customExpense.name || !customExpense.amount) return
    setExpenseItems(items => [
      ...items,
      {
        ...customExpense,
        id: Date.now(),
        amount: parseFloat(customExpense.amount),
        enabled: true
      }
    ])
    setCustomExpense({ name: '', amount: '', frequency: 'monthly', category: 'Utilities' })
  }

  const addIncome = () => {
    setIncomes([...incomes, { id: Date.now(), source: '', amount: '', frequency: 'monthly', personName: '' }])
  }

  const updateIncome = (id, field, value) => {
    setIncomes(incomes.map(inc => inc.id === id ? { ...inc, [field]: value } : inc))
  }

  const removeIncome = (id) => {
    if (incomes.length <= 1) return
    setIncomes(incomes.filter(inc => inc.id !== id))
  }

  const enabledExpenses = expenseItems.filter(e => e.enabled)
  const totalMonthlyExpenses = enabledExpenses.reduce((sum, e) => {
    const multipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    return sum + ((parseFloat(e.amount) || 0) * (multipliers[e.frequency] || 12)) / 12
  }, 0)

  const totalMonthlyIncome = incomes.reduce((sum, inc) => {
    const multipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    return sum + ((parseFloat(inc.amount) || 0) * (multipliers[inc.frequency] || 12)) / 12
  }, 0)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in overflow-hidden">
        {/* Progress bar */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`h-1.5 rounded-full flex-1 transition-all duration-300 ${
                  i <= step ? 'bg-brand-500' : 'bg-slate-200'
                }`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">Step {step + 1} of {STEPS.length} - {STEPS[step].title}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <IncomeStep
              incomes={incomes}
              currency={currency}
              onUpdate={updateIncome}
              onAdd={addIncome}
              onRemove={removeIncome}
            />
          )}
          {step === 2 && (
            <ExpenseStep
              items={expenseItems}
              categoryNames={categoryNames}
              currency={currency}
              customExpense={customExpense}
              setCustomExpense={setCustomExpense}
              onToggle={toggleExpense}
              onUpdateAmount={updateExpenseAmount}
              onUpdateFrequency={updateExpenseFrequency}
              onAddCustom={addCustomExpense}
              totalMonthly={totalMonthlyExpenses}
              totalIncome={totalMonthlyIncome}
            />
          )}
          {step === 3 && (
            <DoneStep
              currency={currency}
              totalIncome={totalMonthlyIncome}
              totalExpenses={totalMonthlyExpenses}
              expenseCount={enabledExpenses.length}
              incomeCount={incomes.filter(i => parseFloat(i.amount) > 0).length}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {step > 0 && step < 3 && (
              <button onClick={prevStep} className="btn-secondary text-sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 3 && (
              <button
                onClick={() => onComplete(null)}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Skip setup
              </button>
            )}
            {step < 3 ? (
              <button onClick={nextStep} className="btn-primary text-sm">
                {step === 0 ? "Let's go" : 'Continue'}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={handleFinish} className="btn-primary text-sm">
                <Sparkles className="h-4 w-4" />
                Start Budgeting
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WelcomeStep() {
  const features = [
    {
      icon: LayoutDashboard,
      title: 'Dashboard',
      desc: 'See your complete financial overview - income vs expenses, savings goals, and smart alerts for upcoming bills.',
      color: 'bg-brand-100 text-brand-600'
    },
    {
      icon: Receipt,
      title: 'Budget / Expenses',
      desc: 'Track all your expenses and savings. Categorise them, set payment types, and monitor spending patterns.',
      color: 'bg-rose-100 text-rose-600'
    },
    {
      icon: CreditCard,
      title: 'Income',
      desc: 'Add salary and income sources for each person. Set pay schedules to track when money comes in.',
      color: 'bg-emerald-100 text-emerald-600'
    },
    {
      icon: Calculator,
      title: 'Bill Allocation',
      desc: 'See how much to transfer each pay period to cover all bills. Tracks what has been paid and what is upcoming.',
      color: 'bg-amber-100 text-amber-600'
    },
    {
      icon: Settings,
      title: 'Settings',
      desc: 'Customise currency, date format, transfer schedules, and manage shared access to your budget.',
      color: 'bg-violet-100 text-violet-600'
    },
  ]

  return (
    <div>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-100 rounded-2xl mb-3">
          <Wallet className="h-7 w-7 text-brand-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome to Budget Tracker</h2>
        <p className="text-slate-500 mt-1">Here's a quick overview of what each section does</p>
      </div>

      <div className="space-y-3">
        {features.map(f => (
          <div key={f.title} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
            <div className={`p-2 rounded-xl ${f.color} flex-shrink-0`}>
              <f.icon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">{f.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IncomeStep({ incomes, currency, onUpdate, onAdd, onRemove }) {
  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

  return (
    <div>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-100 rounded-2xl mb-3">
          <TrendingUp className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Add Your Income</h2>
        <p className="text-slate-500 mt-1">Enter your take-home pay (after tax)</p>
      </div>

      <div className="space-y-3">
        {incomes.map((inc, i) => (
          <div key={inc.id} className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Income Source {i + 1}</span>
              {incomes.length > 1 && (
                <button onClick={() => onRemove(inc.id)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="input-label text-xs">Source Name</label>
                <input
                  type="text"
                  value={inc.source}
                  onChange={(e) => onUpdate(inc.id, 'source', e.target.value)}
                  className="input text-sm"
                  placeholder="e.g., Main Job, Freelance"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label text-xs">Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={inc.amount}
                    onChange={(e) => onUpdate(inc.id, 'amount', e.target.value)}
                    className="input text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="input-label text-xs">Frequency</label>
                  <select
                    value={inc.frequency}
                    onChange={(e) => onUpdate(inc.id, 'frequency', e.target.value)}
                    className="input text-sm"
                  >
                    {frequencies.map(f => (
                      <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onAdd} className="mt-3 btn-secondary text-sm w-full">
        <Plus className="h-4 w-4" />
        Add Another Income Source
      </button>
    </div>
  )
}

function ExpenseStep({ items, categoryNames, currency, customExpense, setCustomExpense, onToggle, onUpdateAmount, onUpdateFrequency, onAddCustom, totalMonthly, totalIncome }) {
  const [expandedCategory, setExpandedCategory] = useState(null)
  const frequencies = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']
  const disposable = totalIncome - totalMonthly

  return (
    <div>
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-rose-100 rounded-2xl mb-3">
          <Receipt className="h-7 w-7 text-rose-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Add Your Expenses</h2>
        <p className="text-slate-500 mt-1">Toggle common expenses on/off and adjust amounts</p>
      </div>

      {/* Running total */}
      <div className="bg-slate-50 rounded-xl p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-slate-400">Monthly expenses</p>
            <p className="text-sm font-bold text-rose-600">{currency}{totalMonthly.toFixed(2)}</p>
          </div>
          {totalIncome > 0 && (
            <div>
              <p className="text-xs text-slate-400">Remaining</p>
              <p className={`text-sm font-bold ${disposable >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {currency}{disposable.toFixed(2)}
              </p>
            </div>
          )}
        </div>
        <span className="badge badge-brand">{items.filter(e => e.enabled).length} selected</span>
      </div>

      {/* Category groups */}
      <div className="space-y-2">
        {categoryNames.map(catName => {
          const catItems = items.filter(e => e.category === catName)
          const enabledCount = catItems.filter(e => e.enabled).length
          const isExpanded = expandedCategory === catName

          return (
            <div key={catName} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : catName)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{catName}</span>
                  {enabledCount > 0 && (
                    <span className="badge badge-success text-[10px]">{enabledCount}</span>
                  )}
                </div>
                <svg className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-3 pb-3 space-y-1.5 animate-slide-down">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        item.enabled ? 'bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <button
                        onClick={() => onToggle(item.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          item.enabled
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {item.enabled && <Check className="h-3 w-3" />}
                      </button>
                      <span className={`text-sm flex-1 ${item.enabled ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                        {item.name}
                        {item.isSaving && <span className="ml-1 text-[10px] text-emerald-600 font-medium">(Saving)</span>}
                      </span>
                      {item.enabled && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-400">{currency}</span>
                            <input
                              type="number"
                              value={item.amount}
                              onChange={(e) => onUpdateAmount(item.id, e.target.value)}
                              className="w-20 text-sm text-right bg-white border border-slate-200 rounded-lg px-2 py-1 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
                            />
                          </div>
                          <select
                            value={item.frequency}
                            onChange={(e) => onUpdateFrequency(item.id, e.target.value)}
                            className="text-xs bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:border-brand-400 outline-none"
                          >
                            {frequencies.map(f => (
                              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add custom */}
      <div className="mt-4 bg-slate-50 rounded-xl p-3">
        <p className="text-xs font-medium text-slate-500 mb-2">Add a custom expense</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customExpense.name}
            onChange={(e) => setCustomExpense({ ...customExpense, name: e.target.value })}
            className="input text-sm flex-1"
            placeholder="Name"
          />
          <input
            type="number"
            value={customExpense.amount}
            onChange={(e) => setCustomExpense({ ...customExpense, amount: e.target.value })}
            className="input text-sm w-24"
            placeholder="Amount"
          />
          <select
            value={customExpense.category}
            onChange={(e) => setCustomExpense({ ...customExpense, category: e.target.value })}
            className="input text-sm w-32"
          >
            {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={onAddCustom}
            disabled={!customExpense.name || !customExpense.amount}
            className="btn-primary text-sm px-3"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function DoneStep({ currency, totalIncome, totalExpenses, expenseCount, incomeCount }) {
  const remaining = totalIncome - totalExpenses

  return (
    <div className="text-center py-4">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
        <Check className="h-8 w-8 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">You're All Set!</h2>
      <p className="text-slate-500 mb-6">Here's your budget summary</p>

      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-6">
        <div className="bg-emerald-50 rounded-xl p-4">
          <p className="text-xs text-emerald-600 font-medium">Monthly Income</p>
          <p className="text-lg font-bold text-emerald-700">{currency}{totalIncome.toFixed(2)}</p>
          <p className="text-xs text-emerald-500">{incomeCount} source{incomeCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-rose-50 rounded-xl p-4">
          <p className="text-xs text-rose-600 font-medium">Monthly Expenses</p>
          <p className="text-lg font-bold text-rose-700">{currency}{totalExpenses.toFixed(2)}</p>
          <p className="text-xs text-rose-500">{expenseCount} item{expenseCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {totalIncome > 0 && (
        <div className={`inline-block rounded-xl px-6 py-3 ${remaining >= 0 ? 'bg-brand-50' : 'bg-rose-50'}`}>
          <p className="text-xs text-slate-500">Estimated Disposable Income</p>
          <p className={`text-xl font-bold ${remaining >= 0 ? 'text-brand-600' : 'text-rose-600'}`}>
            {remaining < 0 ? '-' : ''}{currency}{Math.abs(remaining).toFixed(2)}
            <span className="text-xs font-normal text-slate-400"> / month</span>
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-6">
        You can adjust everything later in the Budget and Income tabs.
      </p>
    </div>
  )
}
