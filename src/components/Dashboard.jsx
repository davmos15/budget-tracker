import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, PieChart, BarChart3, AlertTriangle, Clock, CalendarClock, Bell, CreditCard, Zap, Wallet, PiggyBank } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import { PieChart as RechartsPieChart, Pie, Cell, Sector, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function Dashboard({ expenses, salaries, people, categories, settings }) {
  const [viewMode, setViewMode] = useState('Monthly')
  const [expenseChartType, setExpenseChartType] = useState('pie')
  const [collapsedCategories, setCollapsedCategories] = useState(new Set())
  const [activePieIndex, setActivePieIndex] = useState(null)

  const viewModes = ['Weekly', 'Fortnightly', 'Monthly', 'Yearly']
  const periodLabels = { Weekly: 'week', Fortnightly: 'fortnight', Monthly: 'month', Yearly: 'year' }
  const chartTypes = [
    { id: 'pie', icon: PieChart, label: 'Pie Chart' },
    { id: 'bar', icon: BarChart3, label: 'Bar Chart' }
  ]

  const calculateYearlyAmount = (amount, frequency) => {
    const multipliers = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }
    return amount * (multipliers[frequency] || 0)
  }

  const { totalIncome, totalExpenses, totalSavingsAmt, netSavings, expensesByCategory } = useMemo(() => {
    const totalIncome = salaries.reduce((sum, s) => sum + calculateYearlyAmount(s.amount, s.frequency), 0)
    const totalExpenses = expenses.filter(e => (e.itemType || 'expense') === 'expense')
      .reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)
    const totalSavingsAmt = expenses.filter(e => e.itemType === 'saving')
      .reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)

    const expenseOnly = expenses.filter(e => (e.itemType || 'expense') === 'expense')

    const expensesByCategory = categories.reduce((acc, cat) => {
      const catExpenses = expenseOnly.filter(e => e.categoryId === cat.id)
      acc[cat.id] = {
        amount: catExpenses.reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0),
        count: catExpenses.length
      }
      return acc
    }, {})

    return { totalIncome, totalExpenses, totalSavingsAmt, netSavings: totalIncome - totalExpenses - totalSavingsAmt, expensesByCategory }
  }, [expenses, salaries, categories])

  const getAmountForPeriod = (yearlyAmount) => {
    const divisors = { 'Weekly': 52, 'Fortnightly': 26, 'Monthly': 12, 'Yearly': 1 }
    return yearlyAmount / divisors[viewMode]
  }

  const formatCurrency = (amount) => {
    return `${settings.currency || '$'}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  // Smart notifications
  const notifications = useMemo(() => {
    const alerts = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    expenses.forEach(expense => {
      // Upcoming payments (next 7 days)
      if (expense.nextDueDate) {
        const dueDate = new Date(expense.nextDueDate)
        dueDate.setHours(0, 0, 0, 0)
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))

        const isAutoPay = expense.paymentType === 'direct_debit' || expense.paymentType === 'standing_order'

        if (daysUntil < 0 && !isAutoPay) {
          alerts.push({
            type: 'overdue',
            severity: 'danger',
            icon: AlertTriangle,
            title: `${expense.name} is overdue`,
            detail: `Was due ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago - ${formatCurrency(expense.amount)}`,
            expense
          })
        } else if (daysUntil <= 7 && daysUntil >= 0) {
          alerts.push({
            type: 'upcoming',
            severity: 'warning',
            icon: CalendarClock,
            title: `${expense.name} due ${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}`,
            detail: `${formatCurrency(expense.amount)} - ${expense.paymentType === 'direct_debit' ? 'Auto-pay' : 'Manual payment needed'}`,
            expense
          })
        }
      }

      // Expiring subscriptions (next 30 days)
      if (expense.subscriptionEndDate) {
        const endDate = new Date(expense.subscriptionEndDate)
        endDate.setHours(0, 0, 0, 0)
        const daysUntilExpiry = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24))

        if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
          alerts.push({
            type: 'expiring',
            severity: 'info',
            icon: Clock,
            title: `${expense.name} expires ${daysUntilExpiry === 0 ? 'today' : `in ${daysUntilExpiry} days`}`,
            detail: `Subscription ends ${endDate.toLocaleDateString()}`,
            expense
          })
        }
      }

      // Price changes coming up
      if (expense.priceChangeDate && expense.priceChangeAmount) {
        const changeDate = new Date(expense.priceChangeDate)
        changeDate.setHours(0, 0, 0, 0)
        const daysUntilChange = Math.ceil((changeDate - today) / (1000 * 60 * 60 * 24))

        if (daysUntilChange <= 30 && daysUntilChange >= 0) {
          const diff = expense.priceChangeAmount - expense.amount
          alerts.push({
            type: 'price_change',
            severity: diff > 0 ? 'warning' : 'success',
            icon: Zap,
            title: `${expense.name} price ${diff > 0 ? 'increase' : 'decrease'} in ${daysUntilChange} days`,
            detail: `${formatCurrency(expense.amount)} -> ${formatCurrency(expense.priceChangeAmount)} (${diff > 0 ? '+' : ''}${formatCurrency(diff)})`,
            expense
          })
        }
      }

      // Manual transfer reminders for non-direct-debit expenses
      if (expense.paymentType === 'manual' && expense.nextDueDate) {
        const dueDate = new Date(expense.nextDueDate)
        dueDate.setHours(0, 0, 0, 0)
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))

        if (daysUntil <= 3 && daysUntil >= 0) {
          alerts.push({
            type: 'manual_transfer',
            severity: 'warning',
            icon: CreditCard,
            title: `Manual transfer needed: ${expense.name}`,
            detail: `${formatCurrency(expense.amount)} due ${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}`,
            expense
          })
        }
      }
    })

    // Sort: overdue first, then by severity
    const severityOrder = { danger: 0, warning: 1, info: 2, success: 3 }
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return alerts
  }, [expenses, settings])

  const toggleCategoryCollapse = (key) => {
    const next = new Set(collapsedCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsedCategories(next)
  }

  // Per-person breakdown data
  const personBreakdowns = useMemo(() => {
    return people.map(person => {
      const personSalaries = salaries.filter(s => s.personId === person.id)
      const personIncome = personSalaries.reduce((sum, s) => sum + calculateYearlyAmount(s.amount, s.frequency), 0)

      const personExpenses = expenses.filter(e => e.personId === person.id && (e.itemType || 'expense') === 'expense')
      const personSavings = expenses.filter(e => e.personId === person.id && e.itemType === 'saving')

      const expensesByCategory = categories
        .map(cat => ({
          ...cat,
          items: personExpenses.filter(e => e.categoryId === cat.id).map(e => ({
            ...e,
            yearlyAmount: calculateYearlyAmount(e.amount, e.frequency)
          })),
          yearlyTotal: personExpenses.filter(e => e.categoryId === cat.id)
            .reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)
        }))
        .filter(cat => cat.items.length > 0)

      const savingsByCategory = categories
        .map(cat => ({
          ...cat,
          items: personSavings.filter(e => e.categoryId === cat.id).map(e => ({
            ...e,
            yearlyAmount: calculateYearlyAmount(e.amount, e.frequency)
          })),
          yearlyTotal: personSavings.filter(e => e.categoryId === cat.id)
            .reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)
        }))
        .filter(cat => cat.items.length > 0)

      // Savings without a category
      const uncategorizedSavings = personSavings.filter(e => !e.categoryId || !categories.find(c => c.id === e.categoryId))
        .map(e => ({ ...e, yearlyAmount: calculateYearlyAmount(e.amount, e.frequency) }))

      const totalPersonExpenses = personExpenses.reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)
      const totalPersonSavings = personSavings.reduce((sum, e) => sum + calculateYearlyAmount(e.amount, e.frequency), 0)

      return {
        person,
        salaries: personSalaries,
        personIncome,
        expensesByCategory,
        savingsByCategory,
        uncategorizedSavings,
        totalPersonExpenses,
        totalPersonSavings,
        disposable: personIncome - totalPersonExpenses - totalPersonSavings
      }
    })
  }, [expenses, salaries, people, categories])

  const expenseChartData = categories
    .filter(c => expensesByCategory[c.id]?.amount > 0)
    .map(c => ({
      name: c.name,
      value: Math.round(getAmountForPeriod(expensesByCategory[c.id]?.amount || 0) * 100) / 100,
      color: c.color
    }))

  const savingsChartData = useMemo(() => {
    const savingsByCategory = {}
    expenses.filter(e => e.itemType === 'saving').forEach(e => {
      const cat = categories.find(c => c.id === e.categoryId)
      const catName = cat?.name || 'Other'
      const catColor = cat?.color || '#94a3b8'
      if (!savingsByCategory[catName]) savingsByCategory[catName] = { name: catName, value: 0, color: catColor }
      savingsByCategory[catName].value += calculateYearlyAmount(e.amount, e.frequency)
    })
    return Object.values(savingsByCategory).map(d => ({
      ...d,
      value: Math.round(getAmountForPeriod(d.value) * 100) / 100
    })).filter(d => d.value > 0)
  }, [expenses, categories, viewMode])

  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 4}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke="white"
          strokeWidth={3}
          style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))' }}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#1e293b" fontSize={14} fontWeight={600}>
          {payload.name}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize={12}>
          {formatCurrency(value)}
        </text>
      </g>
    )
  }

  const renderChart = (data, chartType) => {
    if (data.length === 0) {
      return <p className="text-sm text-slate-400 text-center py-8">No data to display</p>
    }

    switch (chartType) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                activeIndex={activePieIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_, index) => setActivePieIndex(index)}
                onMouseLeave={() => setActivePieIndex(null)}
                onClick={(_, index) => setActivePieIndex(activePieIndex === index ? null : index)}
                style={{ outline: 'none', cursor: 'pointer' }}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} style={{ outline: 'none' }} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              />
              <Legend
                formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        )
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with view mode */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
            <InfoTooltip text="Your financial overview showing income, expenses, savings, and disposable income. Use the period selector to view amounts weekly, fortnightly, monthly, or yearly." />
          </div>
          <p className="text-sm text-slate-500 mt-1">Your financial overview at a glance</p>
        </div>
        <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          {viewModes.map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === mode
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Smart Notifications */}
      {settings.showDashboardAlerts !== false && notifications.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Bell className="h-4 w-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Alerts & Reminders</h3>
            <InfoTooltip text="Smart alerts for upcoming payments, overdue bills, expiring subscriptions, and price changes. Based on dates you set on your expenses." />
            <span className="badge badge-warning">{notifications.length}</span>
          </div>
          <div className="space-y-2.5 max-h-60 overflow-y-auto">
            {notifications.map((alert, i) => (
              <div
                key={i}
                className={`alert alert-${alert.severity}`}
              >
                <alert.icon className="h-4.5 w-4.5 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs opacity-75 mt-0.5">{alert.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-success">
          <div className="flex items-center justify-between sm:mb-3">
            <p className="text-sm text-white/80 font-medium">Total Income</p>
            <div className="p-2 bg-white/20 rounded-xl sm:block hidden">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold sm:hidden">{formatCurrency(getAmountForPeriod(totalIncome))}</p>
          </div>
          <p className="text-2xl font-bold hidden sm:block">{formatCurrency(getAmountForPeriod(totalIncome))}</p>
          <p className="text-xs text-white/60 mt-1 hidden sm:block">per {periodLabels[viewMode]}</p>
        </div>

        <div className="stat-card bg-gradient-danger">
          <div className="flex items-center justify-between sm:mb-3">
            <p className="text-sm text-white/80 font-medium">Total Expenses</p>
            <div className="p-2 bg-white/20 rounded-xl sm:block hidden">
              <TrendingDown className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold sm:hidden">{formatCurrency(getAmountForPeriod(totalExpenses))}</p>
          </div>
          <p className="text-2xl font-bold hidden sm:block">{formatCurrency(getAmountForPeriod(totalExpenses))}</p>
          <p className="text-xs text-white/60 mt-1 hidden sm:block">per {periodLabels[viewMode]}</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-violet-500 to-purple-600">
          <div className="flex items-center justify-between sm:mb-3">
            <p className="text-sm text-white/80 font-medium">Total Savings</p>
            <div className="p-2 bg-white/20 rounded-xl sm:block hidden">
              <PiggyBank className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold sm:hidden">{formatCurrency(getAmountForPeriod(totalSavingsAmt))}</p>
          </div>
          <p className="text-2xl font-bold hidden sm:block">{formatCurrency(getAmountForPeriod(totalSavingsAmt))}</p>
          <p className="text-xs text-white/60 mt-1 hidden sm:block">per {periodLabels[viewMode]}</p>
        </div>

        <div className={`stat-card ${netSavings >= 0 ? 'bg-gradient-info' : 'bg-gradient-danger'}`}>
          <div className="flex items-center justify-between sm:mb-3">
            <p className="text-sm text-white/80 font-medium">Disposable Income</p>
            <div className="p-2 bg-white/20 rounded-xl sm:block hidden">
              <Wallet className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold sm:hidden">
              {netSavings < 0 ? '-' : ''}{formatCurrency(getAmountForPeriod(netSavings))}
            </p>
          </div>
          <p className="text-2xl font-bold hidden sm:block">
            {netSavings < 0 ? '-' : ''}{formatCurrency(getAmountForPeriod(netSavings))}
          </p>
          <p className="text-xs text-white/60 mt-1 hidden sm:block">per {periodLabels[viewMode]} after expenses & savings</p>
        </div>
      </div>

      {/* Two-column breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Per-person breakdown table */}
        <div className="card p-5 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-slate-900">Breakdown by Person</h3>
            <InfoTooltip text="Income, expenses, and savings broken down by person and category. Click a category header to collapse or expand it." />
          </div>
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1">
            {personBreakdowns.map(({ person, salaries: personSalaries, personIncome, expensesByCategory: personExpCats, savingsByCategory: personSavCats, uncategorizedSavings, totalPersonExpenses, totalPersonSavings, disposable }) => (
              <div key={person.id}>
                {/* Person header */}
                <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-slate-200">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: person.color }}>
                    {person.name.charAt(0)}
                  </div>
                  <h4 className="font-semibold text-slate-900">{person.name}</h4>
                </div>

                {/* Income */}
                {personSalaries.length > 0 && (
                  <div className="mb-3">
                    <div
                      className="flex items-center justify-between cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors"
                      onClick={() => toggleCategoryCollapse(`${person.id}-income`)}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-700">Income</span>
                        {collapsedCategories.has(`${person.id}-income`)
                          ? <ChevronDown className="h-3 w-3 text-slate-400" />
                          : <ChevronUp className="h-3 w-3 text-slate-400" />
                        }
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">{formatCurrency(getAmountForPeriod(personIncome))}</span>
                    </div>
                    {!collapsedCategories.has(`${person.id}-income`) && (
                      <div className="ml-6 mt-1 space-y-0.5 border-l-2 border-emerald-200 pl-3">
                        {personSalaries.map(s => (
                          <div key={s.id} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-slate-600">{s.name || 'Salary'}</span>
                            <span className="text-slate-700 font-medium">{formatCurrency(getAmountForPeriod(calculateYearlyAmount(s.amount, s.frequency)))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Expenses by category */}
                {personExpCats.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 px-2 mb-1">
                      <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                      <span className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Expenses</span>
                    </div>
                    {personExpCats.map(cat => {
                      const key = `${person.id}-exp-${cat.id}`
                      return (
                        <div key={cat.id} className="mb-1">
                          <div
                            className="flex items-center justify-between cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors"
                            onClick={() => toggleCategoryCollapse(key)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="text-sm font-medium text-slate-700 truncate">{cat.name}</span>
                              <span className="text-[10px] text-slate-400">{cat.items.length}</span>
                              {collapsedCategories.has(key)
                                ? <ChevronDown className="h-3 w-3 text-slate-400" />
                                : <ChevronUp className="h-3 w-3 text-slate-400" />
                              }
                            </div>
                            <span className="text-sm font-semibold text-slate-900 ml-2 flex-shrink-0">{formatCurrency(getAmountForPeriod(cat.yearlyTotal))}</span>
                          </div>
                          {!collapsedCategories.has(key) && (
                            <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 pl-3" style={{ borderColor: cat.color + '40' }}>
                              {cat.items.map(item => (
                                <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-600">{item.name}</span>
                                    {item.paymentType && (
                                      <span className="text-slate-400 text-[10px]">
                                        {item.paymentType === 'direct_debit' ? 'DD' : item.paymentType === 'standing_order' ? 'SO' : item.paymentType === 'manual' ? 'Manual' : 'Card'}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-700 font-medium">{formatCurrency(getAmountForPeriod(item.yearlyAmount))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Savings by category */}
                {(personSavCats.length > 0 || uncategorizedSavings.length > 0) && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 px-2 mb-1">
                      <PiggyBank className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Savings</span>
                    </div>
                    {personSavCats.map(cat => {
                      const key = `${person.id}-sav-${cat.id}`
                      return (
                        <div key={cat.id} className="mb-1">
                          <div
                            className="flex items-center justify-between cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors"
                            onClick={() => toggleCategoryCollapse(key)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="text-sm font-medium text-slate-700 truncate">{cat.name}</span>
                              <span className="text-[10px] text-slate-400">{cat.items.length}</span>
                              {collapsedCategories.has(key)
                                ? <ChevronDown className="h-3 w-3 text-slate-400" />
                                : <ChevronUp className="h-3 w-3 text-slate-400" />
                              }
                            </div>
                            <span className="text-sm font-semibold text-slate-900 ml-2 flex-shrink-0">{formatCurrency(getAmountForPeriod(cat.yearlyTotal))}</span>
                          </div>
                          {!collapsedCategories.has(key) && (
                            <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 pl-3" style={{ borderColor: cat.color + '40' }}>
                              {cat.items.map(item => (
                                <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                                  <span className="text-slate-600">{item.name}</span>
                                  <span className="text-slate-700 font-medium">{formatCurrency(getAmountForPeriod(item.yearlyAmount))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {uncategorizedSavings.length > 0 && (
                      <div className="ml-6 space-y-0.5 border-l-2 border-violet-200 pl-3">
                        {uncategorizedSavings.map(item => (
                          <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-slate-600">{item.name}</span>
                            <span className="text-slate-700 font-medium">{formatCurrency(getAmountForPeriod(item.yearlyAmount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Person totals */}
                <div className="bg-slate-50 rounded-xl px-3 py-2 mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Expenses</span>
                    <span className="text-rose-600 font-medium">-{formatCurrency(getAmountForPeriod(totalPersonExpenses))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Savings</span>
                    <span className="text-violet-600 font-medium">-{formatCurrency(getAmountForPeriod(totalPersonSavings))}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-1 mt-1">
                    <span className="text-slate-700">Disposable</span>
                    <span className={disposable >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {disposable < 0 ? '-' : ''}{formatCurrency(getAmountForPeriod(disposable))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Charts */}
        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Expenses by Category</h3>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {chartTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setExpenseChartType(type.id)}
                    className={`p-1.5 rounded-md transition-all ${
                      expenseChartType === type.id
                        ? 'bg-white shadow-sm text-brand-600'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                    title={type.label}
                  >
                    <type.icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            {renderChart(expenseChartData, expenseChartType)}
          </div>

          {/* Savings chart */}
          {savingsChartData.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Savings by Category</h3>
              </div>
              {renderChart(savingsChartData, 'pie')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
