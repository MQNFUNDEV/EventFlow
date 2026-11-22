import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Plus, Search, RefreshCw, Pencil, UserX, UserCheck,
  Upload, Users, X, Trash2,
} from 'lucide-react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './ParticipantManagement.css'

type Role = 'super_admin' | 'event_admin' | 'front_desk'
type Category = string

type Participant = {
  id: string
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  category: Category
  organisation: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

type ParticipantForm = {
  full_name: string
  email: string
  phone: string
  category: Category
  organisation: string
  notes: string
}

type ParticipantInsert = {
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  category: Category
  organisation: string | null
  notes: string | null
}

const emptyForm: ParticipantForm = {
  full_name: '',
  email: '',
  phone: '',
  category: 'staff',
  organisation: '',
  notes: '',
}

function normaliseEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function normalisePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function generateParticipantCode() {
  return `JMX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

export default function ParticipantManagement({
  currentRole,
}: {
  currentRole: Role
}) {
  const canManage = currentRole === 'super_admin' || currentRole === 'event_admin'
  const canImport = ['super_admin', 'event_admin', 'front_desk'].includes(currentRole)

  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [form, setForm] = useState<ParticipantForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const loadParticipants = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('participants').select('*').order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else { setParticipants((data ?? []) as Participant[]); setError('') }

    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initialLoad() {
      const { data: settings } = await supabase.from('display_state').select('payload').eq('id', 1).maybeSingle()
      if (!cancelled) setCategories(readParticipantCategories(settings?.payload))
      const { data, error: loadError } = await supabase.from('participants').select('*').order('created_at', { ascending: false })
      if (cancelled) return
      if (loadError) setError(loadError.message)
      else setParticipants((data ?? []) as Participant[])
      setLoading(false)
    }
    void initialLoad()
    return () => { cancelled = true }
  }, [])

  function openAddForm() {
    setEditingId(null)
    setForm({ ...emptyForm, category: categories[0]?.id ?? 'staff' })
    setFormOpen(true)
    setError('')
    setMessage('')
  }

  function openEditForm(participant: Participant) {
    setEditingId(participant.id)
    setForm({
      full_name: participant.full_name,
      email: participant.email ?? '',
      phone: participant.phone ?? '',
      category: participant.category,
      organisation: participant.organisation ?? '',
      notes: participant.notes ?? '',
    })
    setFormOpen(true)
    setError('')
    setMessage('')
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function findDuplicate(email: string, phone: string, excludeId?: string) {
    const normalEmail = normaliseEmail(email)
    const normalPhone = normalisePhone(phone)

    return participants.find((participant) => {
      if (participant.id === excludeId) return false

      const emailMatch =
        normalEmail && normaliseEmail(participant.email) === normalEmail
      const phoneMatch =
        normalPhone && normalisePhone(participant.phone) === normalPhone

      return Boolean(emailMatch || phoneMatch)
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    const duplicate = findDuplicate(
      form.email,
      form.phone,
      editingId ?? undefined,
    )

    if (duplicate) {
      setError(
        `Possible duplicate found: ${duplicate.full_name} (${duplicate.participant_code}). Check the email or phone number.`,
      )
      setSaving(false)
      return
    }

    const values = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      category: form.category,
      organisation: form.organisation.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const result = editingId
      ? await supabase
          .from('participants')
          .update(values)
          .eq('id', editingId)
      : await supabase
          .from('participants')
          .insert({
            ...values,
            participant_code: generateParticipantCode(),
          })

    if (result.error) {
      setError(result.error.message)
    } else {
      setMessage(
        editingId
          ? 'Participant updated.'
          : 'Participant added successfully.',
      )
      closeForm()
      await loadParticipants()
    }

    setSaving(false)
  }

  async function toggleActive(participant: Participant) {
    const action = participant.is_active ? 'deactivate' : 'reactivate'

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${participant.full_name}?`,
      )
    ) {
      return
    }

    setError('')
    setMessage('')

    const { error: updateError } = await supabase
      .from('participants')
      .update({
        is_active: !participant.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', participant.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage(`Participant ${action}d successfully.`)
      await loadParticipants()
    }
  }

  async function clearDirectory() {
    if (!canManage || clearing) return
    const activeParticipants = participants.filter((participant) => participant.is_active).length
    if (!activeParticipants) return

    const confirmed = window.confirm(
      `Clear the active participant directory? This will deactivate all ${activeParticipants} active participants. Attendance and Lucky Draw history will be preserved, and participants can be restored from the Inactive filter.`,
    )
    if (!confirmed) return

    setClearing(true)
    setError('')
    setMessage('')
    const { error: clearError } = await supabase
      .from('participants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('is_active', true)

    if (clearError) {
      setError(clearError.message)
    } else {
      setSearch('')
      setCategoryFilter('all')
      setStatusFilter('active')
      setMessage(`${activeParticipants} participant(s) moved to Inactive. Attendance and Lucky Draw history were preserved.`)
      await loadParticipants()
    }
    setClearing(false)
  }
  async function handleCsvImport(file?: File) {
    if (!file || !canImport) return

    setImporting(true)
    setError('')
    setMessage('')

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,

      complete: async (result) => {
        try {
          const getValue = (
            row: Record<string, string>,
            names: string[],
          ) => {
            const normaliseHeader = (value: string) =>
              value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
            const aliases = names.map(normaliseHeader)
            const rowEntries = Object.entries(row)
            const entry = rowEntries.find(([key]) =>
              aliases.includes(normaliseHeader(key)),
            ) ?? rowEntries.find(([key]) => {
              const header = normaliseHeader(key)
              return aliases.some((alias) => alias.length >= 5 && header.includes(alias))
            })

            return (entry?.[1] ?? '').trim()
          }

          const knownEmails = new Set(
            participants.map((p) => normaliseEmail(p.email)).filter(Boolean),
          )

          const knownPhones = new Set(
            participants.map((p) => normalisePhone(p.phone)).filter(Boolean),
          )

          let skipped = 0
          const rowsToInsert: ParticipantInsert[] = []

          for (const row of result.data) {
            const fullName = getValue(row, [
              'fullname',
              'participantname',
              'yourname',
              'whatisyourfullname',
              'name',
            ])

            const email = getValue(row, ['emailaddress', 'email'])
            const phone = getValue(row, ['phonenumber', 'mobilenumber', 'mobile', 'phone'])
            const rawCategory = getValue(row, [
              'category',
              'participantcategory',
              'studentstaff',
              'staffstudent',
              'employmentstatus',
            ]).toLowerCase()
            const matchedCategory = categories.find((item) => item.id.toLowerCase() === rawCategory || item.name.toLowerCase() === rawCategory)
            const legacyCategory = rawCategory.includes('student') || rawCategory.includes('pupil') ? categories.find((item) => item.id === 'student') : rawCategory.includes('staff') || rawCategory.includes('employee') || rawCategory.includes('lecturer') ? categories.find((item) => item.id === 'staff') : undefined
            const categoryValue = matchedCategory?.id ?? legacyCategory?.id ?? rawCategory

            const organisation = getValue(row, [
              'organisation',
              'organization',
              'company',
              'school',
              'institution',
            ])

            const notes = getValue(row, ['notes', 'remarks'])

            const normalEmail = normaliseEmail(email)
            const normalPhone = normalisePhone(phone)

            if (
              !fullName ||
              !categories.some((item) => item.id === categoryValue) ||
              (normalEmail && knownEmails.has(normalEmail)) ||
              (normalPhone && knownPhones.has(normalPhone))
            ) {
              skipped++
              continue
            }

            if (normalEmail) knownEmails.add(normalEmail)
            if (normalPhone) knownPhones.add(normalPhone)

            rowsToInsert.push({
              participant_code: generateParticipantCode(),
              full_name: fullName,
              email: email || null,
              phone: phone || null,
              category: categoryValue as Category,
              organisation: organisation || null,
              notes: notes || null,
            })
          }

          if (rowsToInsert.length === 0) {
            setMessage(
              `No new participants imported. ${skipped} row(s) skipped or invalid.`,
            )
          } else {
            const { error: insertError } = await supabase
              .from('participants')
              .insert(rowsToInsert)

            if (insertError) {
              setError(insertError.message)
            } else {
              setMessage(
                `${rowsToInsert.length} participant(s) imported. ${skipped} row(s) skipped because of missing or duplicate information.`,
              )
              await loadParticipants()
            }
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'CSV import failed.',
          )
        } finally {
          setImporting(false)

          if (fileInput.current) {
            fileInput.current.value = ''
          }
        }
      },

      error: (parseError) => {
        setError(parseError.message)
        setImporting(false)

        if (fileInput.current) {
          fileInput.current.value = ''
        }
      },
    })
  }

  const filteredParticipants = participants.filter((participant) => {
    const term = search.trim().toLowerCase()

    const matchesSearch =
      !term ||
      participant.full_name.toLowerCase().includes(term) ||
      participant.participant_code.toLowerCase().includes(term) ||
      (participant.email ?? '').toLowerCase().includes(term) ||
      (participant.phone ?? '').toLowerCase().includes(term)

    const matchesCategory =
      categoryFilter === 'all' || participant.category === categoryFilter

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && participant.is_active) ||
      (statusFilter === 'inactive' && !participant.is_active)

    return matchesSearch && matchesCategory && matchesStatus
  })

  const activeCount = participants.filter((p) => p.is_active).length

  return (
    <div className="participant-management">
      <div className="participant-toolbar">
        <div className="participant-summary">
          <div className="participant-summary-icon">
            <Users size={21} />
          </div>
          <div>
            <strong>{participants.length} participants</strong>
            <span>{activeCount} active registrations</span>
          </div>
        </div>

        <div className="participant-toolbar-actions">
          {canImport && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="participant-file-input"
                onChange={(event) =>
                  void handleCsvImport(event.target.files?.[0])
                }
              />

              <button
                className="participant-secondary-button"
                type="button"
                disabled={importing}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} />
                {importing ? 'Importing...' : 'Import CSV'}
              </button>
            </>
          )}

          <button
            className="participant-secondary-button"
            type="button"
            onClick={() => {
              setLoading(true)
              void loadParticipants()
            }}
            disabled={loading}
          >
            <RefreshCw size={16} /> Refresh
          </button>

          {canManage && (
            <button
              className="participant-secondary-button participant-clear-button"
              type="button"
              onClick={() => void clearDirectory()}
              disabled={clearing || loading || activeCount === 0}
              title="Deactivate all active participants while preserving attendance and draw history"
            >
              <Trash2 size={16} /> {clearing ? 'Clearing…' : 'Clear'}
            </button>
          )}

          <button
            className="participant-primary-button"
            type="button"
            onClick={openAddForm}
          >
            <Plus size={17} /> Add Participant
          </button>
        </div>
      </div>

      {error && <div className="participant-alert error">{error}</div>}
      {message && <div className="participant-alert success">{message}</div>}

      {canImport && (
        <div className="participant-import-help">
          <strong>Import Google Form responses</strong>
          <span>In Google Sheets, choose File → Download → Comma-separated values (.csv), then use Import CSV. Include a name, email or phone, and a category matching one of the names configured in Settings → Pool Settings. EventFlow creates participant records here, where you can search and filter them.</span>
        </div>
      )}

      {formOpen && (
        <section className="participant-form-panel">
          <div className="participant-form-heading">
            <div>
              <h3>{editingId ? 'Edit participant' : 'Add new participant'}</h3>
              <p>
                {editingId
                  ? 'Update this participant’s registration details.'
                  : 'Enter the participant details for Johor Meetup X.'}
              </p>
            </div>

            <button
              type="button"
              className="participant-close-button"
              onClick={closeForm}
            >
              <X size={19} />
            </button>
          </div>

          <form className="participant-form" onSubmit={handleSubmit}>
            <label>
              Full name *
              <input
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                required
                maxLength={150}
                placeholder="Participant full name"
              />
            </label>

            <label>
              Category *
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as Category,
                  })
                }
              >
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                placeholder="name@example.com"
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
                placeholder="+60 12-345 6789"
              />
            </label>

            <label>
              Organisation
              <input
                value={form.organisation}
                onChange={(e) =>
                  setForm({ ...form, organisation: e.target.value })
                }
                placeholder="Company, school or organisation"
              />
            </label>

            <label>
              Notes
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value })
                }
                placeholder="Optional notes"
              />
            </label>

            <div className="participant-form-actions">
              <button
                type="button"
                className="participant-secondary-button"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                className="participant-primary-button"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save changes'
                    : 'Add participant'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="participant-list-panel">
        <div className="participant-list-heading">
          <div>
            <h3>Participant Directory</h3>
            <p>Search and manage Johor Meetup X registrations.</p>
          </div>

          <span className="participant-count">
            {filteredParticipants.length} shown
          </span>
        </div>

        <div className="participant-filters">
          <div className="participant-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, email or phone..."
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        {loading ? (
          <div className="participant-empty">Loading participants...</div>
        ) : filteredParticipants.length === 0 ? (
          <div className="participant-empty">
            <Users size={28} />
            <strong>No participants found</strong>
            <span>
              Try changing your search or add a new participant.
            </span>
          </div>
        ) : (
          <div className="participant-table-wrap">
            <table className="participant-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Contact</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredParticipants.map((participant) => (
                  <tr key={participant.id}>
                    <td>
                      <strong>{participant.full_name}</strong>
                      <small>{participant.participant_code}</small>
                      {participant.organisation && (
                        <small>{participant.organisation}</small>
                      )}
                    </td>

                    <td>
                      <span>{participant.email || '—'}</span>
                      <small>{participant.phone || 'No phone number'}</small>
                    </td>

                    <td>
                      <span
                        className={`participant-category ${participant.category} category-color-${Math.max(0, categories.findIndex((item) => item.id === participant.category)) % 5}`}
                      >
                        {categoryName(categories, participant.category)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`participant-status ${participant.is_active ? 'active' : 'inactive'}`}
                      >
                        {participant.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td>
                      <div className="participant-row-actions">
                        {canManage && (
                          <button
                            type="button"
                            className="participant-action-button"
                            onClick={() => openEditForm(participant)}
                            title="Edit participant"
                          >
                            <Pencil size={15} /> Edit
                          </button>
                        )}

                        {canManage && (
                          <button
                            type="button"
                            className="participant-action-button"
                            onClick={() => void toggleActive(participant)}
                            title={
                              participant.is_active
                                ? 'Deactivate participant'
                                : 'Reactivate participant'
                            }
                          >
                            {participant.is_active ? (
                              <>
                                <UserX size={15} /> Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck size={15} /> Reactivate
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
