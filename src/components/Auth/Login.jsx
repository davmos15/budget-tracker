import { useState } from 'react'
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth'
import { auth, googleProvider } from '../../firebase'
import { Mail, Lock, AlertCircle, LogIn, Wallet, TrendingUp, PieChart, Shield } from 'lucide-react'

export default function Login({ onSwitchToSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)

    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address first')
      return
    }

    try {
      await sendPasswordResetEmail(auth, email)
      setResetEmailSent(true)
      setError('')
    } catch (error) {
      setError(error.message)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-brand relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Wallet className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold">Budget Tracker</h1>
          </div>
          <p className="text-xl text-white/80 mb-12 leading-relaxed">
            Take control of your finances with smart tracking, bill allocation, and real-time insights.
          </p>
          <div className="space-y-6">
            {[
              { icon: TrendingUp, text: 'Track income & expenses across multiple people' },
              { icon: PieChart, text: 'Visual breakdowns and smart notifications' },
              { icon: Shield, text: 'Shared budgets with role-based access' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-white/90">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
              <div className="p-2.5 bg-gradient-brand rounded-xl text-white">
                <Wallet className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-gradient">Budget Tracker</h1>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="mt-2 text-slate-500">Sign in to manage your budgets</p>
          </div>

          <div className="card p-8">
            {error && (
              <div className="alert alert-danger mb-6">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {resetEmailSent && (
              <div className="alert alert-success mb-6">
                <span className="text-sm">Password reset email sent! Check your inbox.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="input-label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-11"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-11"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="h-4.5 w-4.5" />
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-slate-400">or</span>
                </div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="mt-4 btn-secondary w-full"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-slate-500">Don't have an account? </span>
              <button
                onClick={onSwitchToSignup}
                className="text-brand-600 hover:text-brand-800 font-semibold"
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
