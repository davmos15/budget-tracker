import { useState, useEffect } from 'react'
import { Save, Globe, Calendar, RefreshCw, User, Share2, Trash2, AlertTriangle, Users, Shield, UserMinus, Check, X, Bell } from 'lucide-react'
import { useFirebase } from '../contexts/FirebaseContext'
import { auth, db } from '../firebase'
import { deleteUser } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayRemove, arrayUnion, collection, getDocs } from 'firebase/firestore'
import ShareBudgetModal from './ShareBudgetModal'
import ScheduleEditor from './ScheduleEditor'
import { SPLIT_METHODS, transferPlan, formatMoney, PERIOD_NOUN, primaryPaySchedule } from '../lib/finance'
import { describeSchedule } from '../lib/schedule'

export default function SettingsPage({ settings, setSettings, people, salaries = [], expenses = [], budgetCode, budgetName, onBack }) {
  const { user, budget, budgetId, budgetOwnerId } = useFirebase()
  const [localSettings, setLocalSettings] = useState({
    ...settings,
    peopleTransferSettings: settings.peopleTransferSettings || {}
  })
  const [showSaved, setShowSaved] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [showManageUsers, setShowManageUsers] = useState(false)
  const [showDeleteBudgetModal, setShowDeleteBudgetModal] = useState(false)
  const [deleteBudgetLoading, setDeleteBudgetLoading] = useState(false)
  const [deleteBudgetError, setDeleteBudgetError] = useState('')
  const [budgetUsers, setBudgetUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const dateFormats = [
    { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY (US)', example: '05/27/2025' },
    { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY (EU)', example: '27/05/2025' },
    { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD (ISO)', example: '2025-05-27' },
    { value: 'dd-MM-yyyy', label: 'DD-MM-YYYY', example: '27-05-2025' },
    { value: 'MMM dd, yyyy', label: 'MMM DD, YYYY', example: 'May 27, 2025' },
    { value: 'dd MMM yyyy', label: 'DD MMM YYYY', example: '27 May 2025' }
  ]

  const currencies = [
    { value: '$', label: '$' },
    { value: '€', label: '€' },
    { value: '£', label: '£' },
    { value: '¥', label: '¥' },
    { value: '₹', label: '₹' },
    { value: '₽', label: '₽' },
    { value: 'R', label: 'R' },
    { value: '₩', label: '₩' },
    { value: 'NZ$', label: 'NZ$' },
    { value: 'C$', label: 'C$' }
  ]

  const updatePersonTransferSettings = (personId, patch) => {
    setLocalSettings({
      ...localSettings,
      peopleTransferSettings: {
        ...localSettings.peopleTransferSettings,
        [personId]: { ...(localSettings.peopleTransferSettings?.[personId] || {}), ...patch }
      }
    })
  }

  const preview = transferPlan({ expenses, people, salaries, settings: localSettings })
  const splitMethod = preview.method

  const handleSave = () => {
    setSettings(localSettings)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 3000)
  }

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings)

  const getDateFormatExample = (format) => {
    const dateFormat = dateFormats.find(f => f.value === format)
    return dateFormat ? dateFormat.example : new Date().toLocaleDateString()
  }

  const isAdmin = budget?.info?.admins?.includes(user.uid) || budget?.info?.createdBy === user.uid

  useEffect(() => {
    if (showManageUsers && budget?.info?.members) {
      loadBudgetUsers()
    }
  }, [showManageUsers, budget])

  const loadBudgetUsers = async () => {
    setLoadingUsers(true)
    try {
      const userPromises = budget.info.members.map(async (userId) => {
        const userDoc = await getDoc(doc(db, 'users', userId))
        const userData = userDoc.data()
        return {
          uid: userId,
          email: userData?.email || 'Unknown',
          name: userData?.name || userData?.email || 'Unknown',
          isAdmin: budget.info.admins?.includes(userId) || budget.info.createdBy === userId,
          isCreator: budget.info.createdBy === userId
        }
      })
      setBudgetUsers(await Promise.all(userPromises))
    } catch (error) {
      console.error('Error loading users:', error)
    }
    setLoadingUsers(false)
  }

  const removeUserFromBudget = async (userId) => {
    if (!isAdmin || userId === user.uid || !budgetOwnerId) return
    try {
      await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
        'info.members': arrayRemove(userId),
        'info.admins': arrayRemove(userId)
      })
      const userDoc = await getDoc(doc(db, 'users', userId))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        const updatedSharedBudgets = (userData.sharedBudgets || []).filter(
          sb => !(sb.budgetId === budgetId && sb.ownerId === budgetOwnerId)
        )
        await updateDoc(doc(db, 'users', userId), { sharedBudgets: updatedSharedBudgets })
      }
      loadBudgetUsers()
    } catch (error) {
      console.error('Error removing user:', error)
    }
  }

  const toggleAdminStatus = async (userId) => {
    if (!isAdmin || userId === budget.info.createdBy || !budgetOwnerId) return
    try {
      const isUserAdmin = budget.info.admins?.includes(userId)
      if (isUserAdmin) {
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.admins': arrayRemove(userId)
        })
      } else {
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.admins': arrayUnion(userId)
        })
      }
      // Reload user list to reflect changes
      await loadBudgetUsers()
    } catch (error) {
      console.error('Error updating admin status:', error)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      const userData = userDoc.data()
      const ownBudgetsRef = collection(db, 'users', user.uid, 'budgets')
      const ownBudgetsSnapshot = await getDocs(ownBudgetsRef)
      for (const budgetDoc of ownBudgetsSnapshot.docs) {
        await deleteDoc(budgetDoc.ref)
      }
      if (userData?.sharedBudgets?.length > 0) {
        for (const sharedBudget of userData.sharedBudgets) {
          try {
            await updateDoc(doc(db, 'users', sharedBudget.ownerId, 'budgets', sharedBudget.budgetId), {
              'info.members': arrayRemove(user.uid),
              'info.admins': arrayRemove(user.uid)
            })
          } catch (error) {
            console.error('Error removing user from shared budget:', error)
          }
        }
      }
      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(auth.currentUser)
    } catch (error) {
      console.error('Error deleting account:', error)
      if (error.code === 'auth/requires-recent-login') {
        setDeleteError('Please log out and log in again before deleting your account.')
      } else {
        setDeleteError('Failed to delete account. Please try again.')
      }
      setDeleteLoading(false)
    }
  }

  const inviteByEmail = async (email) => {
    // Look up user by email
    const emailDoc = await getDoc(doc(db, 'userEmails', email))

    if (emailDoc.exists()) {
      // User has an account — add them immediately
      const { uid: invitedUserId } = emailDoc.data()

      if (budget?.info?.members?.includes(invitedUserId)) {
        throw new Error('This user is already a member of this budget')
      }

      await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
        'info.members': arrayUnion(invitedUserId)
      })

      await updateDoc(doc(db, 'users', invitedUserId), {
        sharedBudgets: arrayUnion({
          budgetId: budgetId,
          ownerId: budgetOwnerId,
          joinedAt: new Date().toISOString()
        })
      })

      await loadBudgetUsers()
      return 'added'
    } else {
      // User hasn't signed in yet — store a pending invite
      const pendingRef = doc(db, 'pendingInvites', email)
      const pendingDoc = await getDoc(pendingRef)
      const existing = pendingDoc.exists() ? (pendingDoc.data().invites || []) : []

      // Check if already invited to this budget
      if (existing.some(inv => inv.budgetId === budgetId && inv.ownerId === budgetOwnerId)) {
        throw new Error('This email has already been invited to this budget')
      }

      await setDoc(pendingRef, {
        invites: arrayUnion({
          budgetId: budgetId,
          ownerId: budgetOwnerId,
          budgetName: budgetName,
          invitedBy: user.displayName || user.email,
          invitedAt: new Date().toISOString()
        })
      }, { merge: true })
      return 'pending'
    }
  }

  const handleDeleteBudget = async () => {
    setDeleteBudgetLoading(true)
    setDeleteBudgetError('')
    try {
      const isOwner = budget?.info?.createdBy === user.uid
      if (isOwner) {
        // Delete the budget doc
        await deleteDoc(doc(db, 'users', user.uid, 'budgets', budgetId))
        // Delete the budget code lookup
        if (budget?.info?.code) {
          try {
            await deleteDoc(doc(db, 'budgetCodes', budget.info.code))
          } catch {
            // Ignore if code doc doesn't exist
          }
        }
        // Remove from all members' sharedBudgets
        const members = budget?.info?.members || []
        for (const memberId of members) {
          if (memberId === user.uid) continue
          try {
            const memberDoc = await getDoc(doc(db, 'users', memberId))
            if (memberDoc.exists()) {
              const memberData = memberDoc.data()
              const updated = (memberData.sharedBudgets || []).filter(
                sb => !(sb.budgetId === budgetId && sb.ownerId === user.uid)
              )
              await updateDoc(doc(db, 'users', memberId), { sharedBudgets: updated })
            }
          } catch (e) {
            console.error('Error cleaning up member:', e)
          }
        }
      } else {
        // Not owner - just leave the budget
        await updateDoc(doc(db, 'users', budgetOwnerId, 'budgets', budgetId), {
          'info.members': arrayRemove(user.uid),
          'info.admins': arrayRemove(user.uid)
        })
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          const userData = userDoc.data()
          const updated = (userData.sharedBudgets || []).filter(
            sb => !(sb.budgetId === budgetId && sb.ownerId === budgetOwnerId)
          )
          await updateDoc(doc(db, 'users', user.uid), { sharedBudgets: updated })
        }
      }
      onBack()
    } catch (error) {
      console.error('Error deleting budget:', error)
      setDeleteBudgetError('Failed to delete budget. Please try again.')
      setDeleteBudgetLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Save bar */}
      {hasChanges && (
        <div className="sticky top-16 z-20 animate-slide-down">
          <div className="card p-3 flex items-center justify-between bg-brand-50 border-brand-200">
            <p className="text-sm text-brand-700 font-medium">You have unsaved changes</p>
            <button onClick={handleSave} className="btn-primary text-sm py-1.5">
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </div>
        </div>
      )}

      {showSaved && (
        <div className="alert alert-success animate-slide-down">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Settings saved successfully</span>
        </div>
      )}

      {/* General Settings */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6">General Settings</h2>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-slate-400" />
              <label className="input-label mb-0">Currency Symbol</label>
            </div>
            <select
              value={localSettings.currency}
              onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
              className="input"
            >
              {currencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <label className="input-label mb-0">Date Format</label>
            </div>
            <select
              value={localSettings.dateFormat}
              onChange={(e) => setLocalSettings({ ...localSettings, dateFormat: e.target.value })}
              className="input"
            >
              {dateFormats.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">
              Preview: {getDateFormatExample(localSettings.dateFormat)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-400" />
                <label className="input-label mb-0">Dashboard Alerts & Reminders</label>
              </div>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, showDashboardAlerts: localSettings.showDashboardAlerts === false ? true : false })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  localSettings.showDashboardAlerts !== false ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localSettings.showDashboardAlerts !== false ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Show upcoming payments, overdue bills, and other alerts on the dashboard
            </p>
          </div>

        </div>
      </div>

      {/* Bills account transfers */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Bills account transfers</h3>
        </div>
        <p className="text-sm text-slate-500 mb-5">How much each person moves into the bills account, and when. Amounts are worked out so money in matches bills out over the year.</p>

        {people.length > 1 && (
          <div className="mb-6">
            <label className="input-label">Share the bills</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SPLIT_METHODS.map(m => (
                <label
                  key={m.value}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                    splitMethod === m.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <input type="radio" name="split" className="sr-only" checked={splitMethod === m.value} onChange={() => setLocalSettings({ ...localSettings, transferSplit: m.value })} />
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">{m.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{m.help}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {people.map(person => {
            const ps = localSettings.peopleTransferSettings?.[person.id] || {}
            const paySchedule = primaryPaySchedule(person.id, salaries)
            const followsPay = ps.followsPay !== false
            const plan = preview.people[person.id]

            return (
              <div key={person.id} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: person.color }} />
                    <h4 className="font-medium text-slate-900 dark:text-white">{person.name}</h4>
                  </div>
                  {plan?.frequency && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      <strong>{formatMoney(plan.perTransfer, localSettings.currency || '$')}</strong> per {PERIOD_NOUN[plan.frequency]}
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followsPay}
                    onChange={(e) => updatePersonTransferSettings(person.id, {
                      followsPay: e.target.checked,
                      schedule: ps.schedule || paySchedule || { frequency: 'fortnightly', anchor: '', weekend: 'none' }
                    })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Transfer on payday</span>
                    <span className="block text-xs text-slate-500">
                      {paySchedule ? describeSchedule(paySchedule) : 'No pay date set yet — add one on the Income tab, or untick to set a transfer day.'}
                    </span>
                  </span>
                </label>

                {(!followsPay || !paySchedule) && (
                  <ScheduleEditor
                    value={ps.schedule}
                    onChange={(schedule) => updatePersonTransferSettings(person.id, { schedule, followsPay: false })}
                    dateLabel="A recent transfer date"
                  />
                )}

                {splitMethod === 'custom' && people.length > 1 && (() => {
                  const mode = ps.topUp ? 'topUp' : ps.amountType === 'percent' ? 'percent' : 'fixed'
                  const setMode = (m) => updatePersonTransferSettings(person.id, m === 'topUp' ? { topUp: true } : { topUp: false, amountType: m })
                  return (
                    <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-600">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`mode-${person.id}`} checked={mode === 'fixed'} onChange={() => setMode('fixed')} className="h-4 w-4 text-brand-600 focus:ring-brand-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-200 w-36">Fixed amount</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          disabled={mode !== 'fixed'}
                          value={ps.fixedAmount ?? ''}
                          onChange={(e) => updatePersonTransferSettings(person.id, { fixedAmount: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          className="input py-1.5 text-sm w-32 disabled:opacity-50"
                          placeholder="per transfer"
                        />
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`mode-${person.id}`} checked={mode === 'percent'} onChange={() => setMode('percent')} className="h-4 w-4 text-brand-600 focus:ring-brand-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-200 w-36">% of take-home pay</span>
                        <div className="relative w-32">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="1"
                            min="0"
                            max="100"
                            disabled={mode !== 'percent'}
                            value={ps.percentOfIncome ?? ''}
                            onChange={(e) => updatePersonTransferSettings(person.id, { percentOfIncome: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            className="input py-1.5 pr-7 text-sm disabled:opacity-50"
                            placeholder="100"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`mode-${person.id}`} checked={mode === 'topUp'} onChange={() => setMode('topUp')} className="h-4 w-4 text-brand-600 focus:ring-brand-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-200">Tops up the rest</span>
                      </label>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>

        {preview.shortfallAnnual > 1 && (
          <div className="alert alert-warning mt-4">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm">
              These transfers are {formatMoney(preview.shortfallAnnual / 26, localSettings.currency || '$')} a fortnight short of your bills.
              {splitMethod === 'custom' ? ' Mark someone as "Tops up the rest".' : ' Check everyone has a pay or transfer date.'}
            </p>
          </div>
        )}
      </div>

      {/* Budget Sharing */}
      {budgetCode && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Budget Sharing</h3>
            <button onClick={() => setShowShareModal(true)} className="btn-primary text-sm">
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
          <div className="bg-brand-50 rounded-xl p-4 flex items-center gap-4">
            <div className="text-2xl font-mono font-bold text-brand-600 bg-white px-5 py-2.5 rounded-xl shadow-sm tracking-widest">
              {budgetCode}
            </div>
            <div>
              <p className="text-sm font-medium text-brand-800">{budgetName}</p>
              <p className="text-xs text-brand-600 mt-0.5">Anyone with this code can join</p>
            </div>
          </div>
        </div>
      )}

      {/* Manage Users */}
      {isAdmin && budgetCode && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Manage Users</h3>
            </div>
            <button onClick={() => setShowManageUsers(true)} className="btn-secondary text-sm">
              <Users className="h-4 w-4" />
              View Users
            </button>
          </div>
          <p className="text-sm text-slate-500">Remove users, promote to admin, or view all budget members.</p>
        </div>
      )}

      {/* Danger Zone */}
      <div className="card border-rose-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <h3 className="font-semibold text-rose-900">Danger Zone</h3>
        </div>

        <div className="space-y-4">
          <div className="bg-rose-50 rounded-xl p-4">
            <p className="text-sm font-medium text-rose-800 mb-1">
              {budget?.info?.createdBy === user.uid ? 'Delete this budget' : 'Leave this budget'}
            </p>
            <p className="text-xs text-rose-600 mb-3">
              {budget?.info?.createdBy === user.uid
                ? 'This will permanently delete the budget and remove all members.'
                : 'You will be removed from this shared budget.'}
            </p>
            <button onClick={() => setShowDeleteBudgetModal(true)} className="btn-danger text-sm">
              <Trash2 className="h-4 w-4" />
              {budget?.info?.createdBy === user.uid ? 'Delete Budget' : 'Leave Budget'}
            </button>
          </div>

          <div className="bg-rose-50 rounded-xl p-4">
            <p className="text-sm font-medium text-rose-800 mb-1">Delete your account</p>
            <p className="text-xs text-rose-600 mb-3">
              Once you delete your account, there is no going back.
            </p>
            <button onClick={() => setShowDeleteModal(true)} className="btn-danger text-sm">
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {showShareModal && (
        <ShareBudgetModal budgetCode={budgetCode} onClose={() => setShowShareModal(false)} />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => { setShowDeleteModal(false); setDeleteError('') }}
          onConfirm={handleDeleteAccount}
          loading={deleteLoading}
          error={deleteError}
        />
      )}

      {showDeleteBudgetModal && (
        <DeleteBudgetModal
          onClose={() => { setShowDeleteBudgetModal(false); setDeleteBudgetError('') }}
          onConfirm={handleDeleteBudget}
          loading={deleteBudgetLoading}
          error={deleteBudgetError}
          isOwner={budget?.info?.createdBy === user.uid}
          budgetName={budgetName}
        />
      )}

      {showManageUsers && (
        <ManageUsersModal
          onClose={() => setShowManageUsers(false)}
          users={budgetUsers}
          loading={loadingUsers}
          currentUserId={user.uid}
          onRemoveUser={removeUserFromBudget}
          onToggleAdmin={toggleAdminStatus}
          isAdmin={isAdmin}
          onInviteByEmail={inviteByEmail}
        />
      )}
    </div>
  )
}

function DeleteAccountModal({ onClose, onConfirm, loading, error }) {
  const [confirmText, setConfirmText] = useState('')
  const canDelete = confirmText === 'DELETE'

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 bg-rose-100 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Delete Account</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600 space-y-2">
            <p>This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-slate-500">
              <li>Your account and all personal data</li>
              <li>All budgets where you are the sole owner</li>
              <li>Your access to shared budgets</li>
            </ul>
          </div>

          {error && <div className="alert alert-danger"><span className="text-sm">{error}</span></div>}

          <div>
            <label className="input-label">Type DELETE to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input"
              placeholder="Type DELETE here"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete || loading}
              className="btn-danger flex-1"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </>
              )}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManageUsersModal({ onClose, users, loading, currentUserId, onRemoveUser, onToggleAdmin, isAdmin, onInviteByEmail }) {
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    setInviteLoading(true)
    try {
      const result = await onInviteByEmail(inviteEmail.trim().toLowerCase())
      setInviteSuccess(result === 'pending'
        ? `Invite saved — ${inviteEmail.trim()} will be added when they sign in`
        : `Added ${inviteEmail.trim()} to the budget`)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err.message)
    }
    setInviteLoading(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-900">Budget Members</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Invite by email */}
          {isAdmin && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Invite by Email</h4>
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess('') }}
                  className="input flex-1 py-2 text-sm"
                  placeholder="Enter email address..."
                  required
                />
                <button type="submit" disabled={inviteLoading || !inviteEmail.trim()} className="btn-primary text-sm whitespace-nowrap">
                  {inviteLoading ? 'Adding...' : 'Add'}
                </button>
              </form>
              {inviteError && <p className="text-xs text-rose-600 mt-1.5">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-emerald-600 mt-1.5">{inviteSuccess}</p>}
              <p className="text-xs text-slate-400 mt-1">If they haven't signed in yet, they'll be added automatically when they do</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-slate-500">Loading users...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.uid} className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{u.name}</p>
                        {u.isCreator && <span className="badge badge-info">Creator</span>}
                        {u.isAdmin && !u.isCreator && <span className="badge badge-brand">Admin</span>}
                        {u.uid === currentUserId && <span className="badge badge-success">You</span>}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
                    </div>

                    {isAdmin && u.uid !== currentUserId && (
                      <div className="flex items-center gap-2">
                        {!u.isCreator && (
                          <button
                            onClick={() => onToggleAdmin(u.uid)}
                            className={`btn text-xs px-3 py-1.5 ${
                              u.isAdmin ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </button>
                        )}

                        {confirmRemove === u.uid ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-rose-600">Sure?</span>
                            <button
                              onClick={() => { onRemoveUser(u.uid); setConfirmRemove(null) }}
                              className="btn-danger text-xs px-2 py-1"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="btn-secondary text-xs px-2 py-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(u.uid)}
                            className="btn text-xs px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          >
                            <UserMinus className="h-3 w-3" />
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  )
}

function DeleteBudgetModal({ onClose, onConfirm, loading, error, isOwner, budgetName }) {
  const [confirmText, setConfirmText] = useState('')
  const canDelete = confirmText === 'DELETE'

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2 bg-rose-100 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">
            {isOwner ? 'Delete Budget' : 'Leave Budget'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600 space-y-2">
            {isOwner ? (
              <>
                <p>This will permanently delete <strong>{budgetName}</strong>:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-slate-500">
                  <li>All expenses, income, and settings</li>
                  <li>All members will lose access</li>
                  <li>The budget sharing code will stop working</li>
                </ul>
              </>
            ) : (
              <p>You will be removed from <strong>{budgetName}</strong> and lose access to all its data.</p>
            )}
          </div>

          {error && <div className="alert alert-danger"><span className="text-sm">{error}</span></div>}

          <div>
            <label className="input-label">Type DELETE to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input"
              placeholder="Type DELETE here"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete || loading}
              className="btn-danger flex-1"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isOwner ? 'Deleting...' : 'Leaving...'}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {isOwner ? 'Delete Budget' : 'Leave Budget'}
                </>
              )}
            </button>
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
