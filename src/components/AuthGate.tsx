
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const allowedRoles = ['super_admin', 'event_admin', 'front_desk', 'marshal']

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotPassword, setForgotPassword] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) setError('Unable to sign in. Check your email and password.')
    setLoading(false)
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: window.location.origin,
      },
    )

    if (error) {
  setError('Unable to send the reset email. Please try again later.')
} else {
      setResetSent(true)
    }

    setLoading(false)
  }

  if (forgotPassword) {
    return (
      <main style={styles.page}>
        <form onSubmit={handleForgotPassword} style={styles.card}>
          <div style={styles.logo}>EF</div>
          <h1 style={styles.title}>Reset your password</h1>

          {resetSent ? (
            <>
              <p style={styles.success}>
                If an account exists with this email address, a password reset
                link has been sent. Please check your inbox and spam folder.
              </p>
              <button
                type="button"
                style={styles.button}
                onClick={() => {
                  setForgotPassword(false)
                  setResetSent(false)
                  setError('')
                }}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <p style={styles.subtitle}>
                Enter your registered email address. We will send you a link
                to reset your EventFlow password.
              </p>

              <label style={styles.label} htmlFor="reset-email">
                Email address
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                style={styles.input}
              />

              {error && <p role="alert" style={styles.error}>{error}</p>}

              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Sending email...' : 'Send reset link'}
              </button>

              <button
                type="button"
                style={styles.textButton}
                onClick={() => {
                  setForgotPassword(false)
                  setError('')
                }}
              >
                Back to sign in
              </button>
            </>
          )}

          <p style={styles.footer}>EVENTFLOW · ACCOUNT RECOVERY</p>
        </form>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logo}>EF</div>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to EventFlow administration.</p>

        <label style={styles.label} htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@example.com"
          style={styles.input}
        />

        <label style={styles.label} htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          style={styles.input}
        />

        <div style={styles.forgotRow}>
          <button
            type="button"
            style={styles.textButton}
            onClick={() => {
              setForgotPassword(true)
              setError('')
            }}
          >
            Forgot password?
          </button>
        </div>

        {error && <p role="alert" style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={styles.footer}>EVENTFLOW · ADMINISTRATION</p>
      </form>
    </main>
  )
}

function PasswordResetForm({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 12) {
      setError('Your new password must contain at least 12 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('The password confirmation does not match.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Unable to update your password. Your reset link may have expired. Request a new one.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  async function finishReset() {
    await supabase.auth.signOut()
    onComplete()
  }

  return (
    <main style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logo}>EF</div>
        <h1 style={styles.title}>
          {success ? 'Password updated' : 'Create a new password'}
        </h1>

        {success ? (
          <>
            <p style={styles.success}>
              Your password has been updated successfully. You can now sign
              in using your new password.
            </p>
            <button type="button" style={styles.button} onClick={finishReset}>
              Return to sign in
            </button>
          </>
        ) : (
          <>
            <p style={styles.subtitle}>
              Choose a new password for your EventFlow administrator account.
            </p>

            <label style={styles.label} htmlFor="reset-new-password">
              New password
            </label>
            <input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
              style={styles.input}
            />

            <label style={styles.label} htmlFor="reset-confirm-password">
              Confirm new password
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter your password again"
              style={styles.input}
            />

            {error && <p role="alert" style={styles.error}>{error}</p>}

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Updating password...' : 'Save new password'}
            </button>
          </>
        )}

        <p style={styles.footer}>EVENTFLOW · ACCOUNT SECURITY</p>
      </form>
    </main>
  )
}

function FirstLoginPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (password.length < 12) {
      setError('Your new password must contain at least 12 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('The password confirmation does not match.')
      return
    }

    setLoading(true)

    const { error: functionError } = await supabase.functions.invoke(
      'admin-management',
      {
        body: {
          action: 'complete-first-login',
          newPassword: password,
        },
      },
    )

    if (functionError) {
      setError('Unable to update your password. Your temporary password may have expired. Contact a Super Admin.')
      setLoading(false)
      return
    }

    setSuccess('Password updated. Signing you out so you can sign in with your new password.')

    await supabase.auth.signOut()
    setLoading(false)
  }

  return (
    <main style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logo}>EF</div>
        <h1 style={styles.title}>Set your password</h1>
        <p style={styles.subtitle}>
          This is your first login. Create a new password before accessing EventFlow.
        </p>

        <label style={styles.label} htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 12 characters"
          style={styles.input}
        />

        <label style={styles.label} htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Enter your new password again"
          style={styles.input}
        />

        {error && <p role="alert" style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Updating password...' : 'Save new password'}
        </button>

        <p style={styles.footer}>EVENTFLOW · ACCOUNT SECURITY</p>
      </form>
    </main>
  )
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [checkingRole, setCheckingRole] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }

      setSession(newSession)
      setInitializing(false)
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return

      if (error) setAccessError('Unable to restore your login session.')

      setSession(data.session)
      setInitializing(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function checkAdministratorRole() {
      if (!session || passwordRecovery) {
        setAuthorized(false)
        setMustChangePassword(false)
        setAccessError('')
        return
      }

      setCheckingRole(true)
      setAuthorized(false)
      setMustChangePassword(false)
      setAccessError('')

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (!active) return

      if (userError || !userData.user) {
        setAccessError('Your login session could not be verified.')
        setCheckingRole(false)
        return
      }

      if (userData.user.app_metadata?.must_change_password === true) {
        setMustChangePassword(true)
        setCheckingRole(false)
        return
      }

      const { data: adminRole, error: roleError } = await supabase
        .from('admin_roles')
        .select('role, is_active')
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (!active) return

      if (roleError) {
        setAccessError('Unable to verify administrator permissions.')
      } else if (
        !adminRole ||
        !adminRole.is_active ||
        !allowedRoles.includes(adminRole.role)
      ) {
        setAccessError('This account does not have an active administrator role.')
      } else {
        setAuthorized(true)
      }

      setCheckingRole(false)
    }

    checkAdministratorRole()

    return () => {
      active = false
    }
  }, [session, passwordRecovery])

  if (initializing || checkingRole) {
    return (
      <main style={styles.page}>
        <p style={{ color: '#64748b' }}>Verifying your access...</p>
      </main>
    )
  }

  if (passwordRecovery && session) {
    return (
      <PasswordResetForm
        onComplete={() => setPasswordRecovery(false)}
      />
    )
  }

  if (!session) return <LoginForm />

  if (mustChangePassword) return <FirstLoginPasswordForm />

  if (!authorized) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>Access restricted</h1>
          <p style={styles.subtitle}>
            {accessError || 'Your account is not authorised to access EventFlow.'}
          </p>
          <button
            style={styles.button}
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </section>
      </main>
    )
  }

  return <>{children}</>
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f6fa',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#ffffff',
    padding: '36px',
    borderRadius: '16px',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08)',
    boxSizing: 'border-box' as const,
  },
  logo: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: '#172554',
    color: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    marginBottom: '24px',
  },
  title: {
    color: '#172554',
    fontSize: '26px',
    margin: '0 0 8px',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
    lineHeight: 1.6,
    marginBottom: '28px',
  },
  label: {
    display: 'block',
    color: '#334155',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '13px',
    border: '1px solid #dbe2ea',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
    outlineColor: '#2563eb',
  },
  button: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: '8px',
    background: '#1d4ed8',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
  },
  textButton: {
    border: 'none',
    background: 'transparent',
    color: '#2563eb',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '8px 0',
  },
  forgotRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '-12px',
    marginBottom: '12px',
  },
  error: {
    color: '#dc2626',
    fontSize: '13px',
    marginBottom: '16px',
  },
  success: {
    color: '#15803d',
    fontSize: '13px',
    lineHeight: 1.6,
    marginBottom: '20px',
  },
  footer: {
    color: '#94a3b8',
    fontSize: '10px',
    letterSpacing: '1.5px',
    textAlign: 'center' as const,
    marginTop: '28px',
  },
}
