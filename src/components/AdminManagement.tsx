import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  RefreshCw,
  UserPlus,
  Copy,
  ShieldCheck,
  KeyRound,
  Power,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AdminManagement.css'

type AdminRole = 'super_admin' | 'event_admin' | 'front_desk'

type AdminAccount = {
  user_id: string
  email: string
  phone_number: string
  role: AdminRole
  is_active: boolean
  created_at: string
  last_sign_in_at: string | null
  must_change_password: boolean
  temporary_password_expires_at: string | null
}

type Credentials = {
  email: string
  password: string
  expiresAt: string
}

const roles: { value: AdminRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'event_admin', label: 'Event Admin' },
  { value: 'front_desk', label: 'Front Desk' },
]

const creatableRoles = roles.filter((item) => item.value !== 'super_admin')


function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export default function AdminManagement({ currentRole }: { currentRole: AdminRole }) {
  const [admins, setAdmins] = useState<AdminAccount[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [role, setRole] = useState<AdminRole>('event_admin')
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function callAdminFunction(payload: Record<string, unknown>) {
    const { data, error: functionError } = await supabase.functions.invoke(
      'admin-management',
      { body: payload },
    )

    if (functionError) {
      throw new Error(functionError.message || 'The request could not be completed.')
    }

    if (data?.error) {
      throw new Error(data.error)
    }

    return data
  }

  const loadAdmins = useCallback(async () => {
  setError('')

  try {
    const { data: authData } = await supabase.auth.getUser()
    setCurrentUserId(authData.user?.id ?? '')

    const data = await callAdminFunction({ action: 'list-admins' })
    setAdmins(data.admins ?? [])
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unable to load administrators.')
  } finally {
    setLoading(false)
  }
}, [])

useEffect(() => {
  let cancelled = false

  async function initialise() {
    if (cancelled) return
    await loadAdmins()
  }

  void Promise.resolve().then(initialise)

  return () => {
    cancelled = true
  }
}, [loadAdmins])


  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')
    setCredentials(null)
    setCopied(false)

    try {
      const data = await callAdminFunction({
        action: 'create-admin',
        email,
        phoneNumber,
        role,
      })

      setCredentials({
        email: data.admin.email,
        password: data.temporary_password,
        expiresAt: data.expires_at,
      })

      setEmail('')
      setPhoneNumber('')
      setRole('event_admin')
      setMessage('Administrator account created successfully.')
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create administrator.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRoleChange(userId: string, nextRole: AdminRole) {
    setError('')
    setMessage('')

    try {
      await callAdminFunction({
        action: 'update-admin',
        userId,
        role: nextRole,
      })
      setMessage('Administrator role updated.')
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role.')
    }
  }

  async function handleStatusChange(admin: AdminAccount) {
    const action = admin.is_active ? 'disable' : 'enable'

    if (!window.confirm(`Are you sure you want to ${action} ${admin.email}?`)) {
      return
    }

    setError('')
    setMessage('')

    try {
      await callAdminFunction({
        action: 'update-admin',
        userId: admin.user_id,
        isActive: !admin.is_active,
      })
      setMessage(`Administrator account ${action}d.`)
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update account status.')
    }
  }

  async function handlePasswordReset(admin: AdminAccount) {
    if (!window.confirm(`Generate a new temporary password for ${admin.email}?`)) {
      return
    }

    setError('')
    setMessage('')
    setCredentials(null)
    setCopied(false)

    try {
      const data = await callAdminFunction({
        action: 'reset-temp-password',
        userId: admin.user_id,
      })

      setCredentials({
        email: data.email,
        password: data.temporary_password,
        expiresAt: data.expires_at,
      })

      setMessage('A new temporary password has been generated.')
      await loadAdmins()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.')
    }
  }

  async function copyCredentials() {
    if (!credentials) return

    try {
      await navigator.clipboard.writeText(
        `Email: ${credentials.email}\nTemporary password: ${credentials.password}`,
      )
      setCopied(true)
    } catch {
      setError('Clipboard access failed. Select and copy the credentials manually.')
    }
  }

  return (
    <div className="admin-management">
      <div className="admin-management-heading">
        <div>
          <h2>Administrator Management</h2>
          <p>Create accounts, assign roles and manage administrator access.</p>
        </div>

        <button
          className="admin-refresh-button"
          onClick={() => void loadAdmins()}
          disabled={loading}
          type="button"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {message && <div className="admin-alert admin-alert-success">{message}</div>}

      {credentials && (
        <section className="admin-credentials-panel">
          <div className="admin-credentials-title">
            <KeyRound size={20} />
            <div>
              <h3>Temporary credentials</h3>
              <p>Copy these details now and share them privately with the new administrator.</p>
            </div>
          </div>

          <div className="admin-credential-row">
            <span>Email</span>
            <strong>{credentials.email}</strong>
          </div>

          <div className="admin-credential-row">
            <span>Temporary password</span>
            <strong className="admin-temporary-password">{credentials.password}</strong>
          </div>

          <div className="admin-credential-row">
            <span>Expires</span>
            <strong>{formatDate(credentials.expiresAt)}</strong>
          </div>

          <button
            className="admin-primary-button"
            type="button"
            onClick={() => void copyCredentials()}
          >
            <Copy size={16} />
            {copied ? 'Copied' : 'Copy credentials'}
          </button>

          <p className="admin-security-note">
            This password is displayed only in this response. The recipient must change it
            after their first login. It expires after 72 hours.
          </p>
        </section>
      )}

      <section className="admin-create-panel">
        <div className="admin-section-title">
          <UserPlus size={19} />
          <h3>Create administrator account</h3>
        </div>

        <form className="admin-create-form" onSubmit={handleCreate}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>

          <label>
            Phone number
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+60 12-345 6789"
              minLength={7}
              maxLength={25}
              required
            />
          </label>

          <label>
            Administrator role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
            >
              {creatableRoles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button className="admin-primary-button" type="submit" disabled={creating}>
            <UserPlus size={16} />
            {creating ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="admin-form-note">
          A random temporary password will be generated. New accounts must set their own
          password before accessing the dashboard.
        </p>
      </section>

      <section className="admin-list-panel">
        <div className="admin-section-title">
          <ShieldCheck size={19} />
          <h3>Administrator accounts</h3>
          <span className="admin-count">{admins.length}</span>
        </div>

        {loading ? (
          <p className="admin-empty-state">Loading administrator accounts...</p>
        ) : admins.length === 0 ? (
          <p className="admin-empty-state">No administrator accounts found.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Account</th>
                </tr>
              </thead>

              <tbody>
                {admins.map((admin) => {
                  const isSelf = admin.user_id === currentUserId

                  return (
                    <tr key={admin.user_id}>
                      <td>
                        <strong>{admin.email || 'No email'}</strong>
                        <small>Created {formatDate(admin.created_at)}</small>
                        {admin.must_change_password && (
                          <small className="admin-first-login">
                            First login password change pending
                          </small>
                        )}
                      </td>

                      <td>{admin.phone_number || '—'}</td>

                      <td>
                        <select
                          className="admin-role-select"
                          value={admin.role}
                          disabled={isSelf}
                          onChange={(event) =>
                            void handleRoleChange(
                              admin.user_id,
                              event.target.value as AdminRole,
                            )
                          }
                        >
                          {roles.filter((item) => currentRole === 'super_admin' || item.value !== 'super_admin').map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <span className={admin.is_active ? 'admin-status active' : 'admin-status inactive'}>
                          {admin.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td>{formatDate(admin.last_sign_in_at)}</td>

                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="admin-small-button"
                            type="button"
                            onClick={() => void handlePasswordReset(admin)}
                            disabled={isSelf}
                            title="Generate a new temporary password"
                          >
                            <KeyRound size={15} />
                            Reset
                          </button>

                          <button
                            className="admin-small-button"
                            type="button"
                            onClick={() => void handleStatusChange(admin)}
                            disabled={isSelf}
                            title={admin.is_active ? 'Disable account' : 'Enable account'}
                          >
                            <Power size={15} />
                            {admin.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                        {isSelf && <small className="admin-self-label">Current account</small>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

