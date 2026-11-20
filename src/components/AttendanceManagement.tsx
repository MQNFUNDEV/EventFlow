import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, RefreshCw, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AttendanceManagement.css'

type Participant = {
  id: string
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  category: 'student' | 'staff'
  is_active: boolean
}
type CheckIn = {
  participant_id: string
  checked_in_at: string
  checked_in_by: string
  check_in_method: 'qr' | 'manual'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(value))
}

function csvCell(value: string | null | undefined) {
  return `"${(value ?? '').replaceAll('"', '""')}"`
}

export default function AttendanceManagement() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [view, setView] = useState<'all' | 'checked_in' | 'waiting'>('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const loadData = useCallback(async () => {
    setError('')
    const [participantResult, checkInResult] = await Promise.all([
      supabase.from('participants').select('id, participant_code, full_name, email, phone, category, is_active').eq('is_active', true).order('full_name'),
      supabase.from('attendance').select('participant_id, checked_in_at, checked_in_by, check_in_method').order('checked_in_at', { ascending: false }),
    ])
    if (participantResult.error) setError(participantResult.error.message)
    else setParticipants((participantResult.data ?? []) as Participant[])
    if (checkInResult.error) setError((current) => current ? `${current} ${checkInResult.error.message}` : checkInResult.error.message)
    else setCheckIns((checkInResult.data ?? []) as CheckIn[])
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function initialLoad() {
      const [participantResult, checkInResult] = await Promise.all([
        supabase.from('participants').select('id, participant_code, full_name, email, phone, category, is_active').eq('is_active', true).order('full_name'),
        supabase.from('attendance').select('participant_id, checked_in_at, checked_in_by, check_in_method').order('checked_in_at', { ascending: false }),
      ])
      if (cancelled) return
      if (participantResult.error) setError(participantResult.error.message)
      else setParticipants((participantResult.data ?? []) as Participant[])
      if (checkInResult.error) setError((current) => current ? `${current} ${checkInResult.error.message}` : checkInResult.error.message)
      else setCheckIns((checkInResult.data ?? []) as CheckIn[])
      setLoading(false)
    }
    void initialLoad()
    return () => { cancelled = true }
  }, [])

  const checkInsByParticipant = useMemo(
    () => new Map(checkIns.map((checkIn) => [checkIn.participant_id, checkIn])),
    [checkIns],
  )
  const activeParticipants = useMemo(() => {
    const term = search.trim().toLowerCase()
    return participants.filter((participant) => {
      const checkIn = checkInsByParticipant.get(participant.id)
      const matchesSearch = !term || [participant.full_name, participant.participant_code, participant.email, participant.phone]
        .some((field) => field?.toLowerCase().includes(term))
      return matchesSearch && (category === 'all' || participant.category === category) &&
        (view === 'all' || (view === 'checked_in' ? Boolean(checkIn) : !checkIn))
    })
  }, [participants, checkInsByParticipant, search, category, view])
  const checkedInCount = participants.filter((participant) => checkInsByParticipant.has(participant.id)).length

  const checkInParticipant = useCallback(async (participant: Participant) => {
    setSavingId(participant.id)
    setError('')
    setMessage('')
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setError(authError?.message ?? 'Please sign in again before recording attendance.')
      setSavingId('')
      return
    }
    const { error: insertError } = await supabase.from('attendance').insert({
      participant_id: participant.id,
      checked_in_by: authData.user.id,
      check_in_method: 'manual',
    })
    if (insertError) {
      if (insertError.code === '23505') {
        setMessage(`${participant.full_name} is already checked in.`)
        await loadData()
      } else setError(insertError.message)
    } else {
      setMessage(`${participant.full_name} checked in successfully.`)
      const checkIn: CheckIn = { participant_id: participant.id, checked_in_at: new Date().toISOString(), checked_in_by: authData.user.id, check_in_method: 'manual' }
      setCheckIns((current) => current.some((row) => row.participant_id === participant.id) ? current : [checkIn, ...current])
    }
    setSavingId('')
  }, [loadData])

  function exportCsv() {
    const rows = [
      ['Participant code', 'Name', 'Category', 'Email', 'Phone', 'Attendance status', 'Check-in time (MYT)', 'Method'],
      ...participants.map((participant) => {
        const checkIn = checkInsByParticipant.get(participant.id)
        return [participant.participant_code, participant.full_name, participant.category, participant.email ?? '', participant.phone ?? '', checkIn ? 'Checked in' : 'Not checked in', checkIn ? new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(checkIn.checked_in_at)) : '', checkIn?.check_in_method ?? '']
      }),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => csvCell(String(cell))).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `eventflow-attendance-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="attendance-page">
      <header className="attendance-heading">
        <div>
          <span className="attendance-eyebrow"><Users size={14} /> EVENT CHECK-IN</span>
          <h2>Attendance</h2>
          <p>Find a registered participant and record their arrival.</p>
        </div>
        <div className="attendance-heading-actions">
          <button className="button-secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
          <button className="button-secondary" onClick={exportCsv} disabled={loading || participants.length === 0}><Download size={16} /> Export CSV</button>
        </div>
      </header>

      {error && <div className="attendance-alert error" role="alert">{error}</div>}
      {message && <div className="attendance-alert success" role="status">{message}</div>}

      <div className="attendance-stats">
        <article><span>Registered participants</span><strong>{participants.length}</strong></article>
        <article><span>Checked in</span><strong>{checkedInCount}</strong></article>
        <article><span>Still expected</span><strong>{participants.length - checkedInCount}</strong></article>
        <article><span>Attendance so far</span><strong>{participants.length ? `${Math.round((checkedInCount / participants.length) * 100)}%` : '0%'}</strong></article>
      </div>

      <section className="panel attendance-list-panel">
        <div className="attendance-toolbar">
          <label className="attendance-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code, email or phone" /></label>
          <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option><option value="staff">Staff</option><option value="student">Students</option>
          </select>
          <select aria-label="Filter by attendance status" value={view} onChange={(event) => setView(event.target.value as typeof view)}>
            <option value="all">Everyone</option><option value="waiting">Not checked in</option><option value="checked_in">Checked in</option>
          </select>
        </div>

        {loading ? <p className="attendance-empty">Loading attendance…</p> : activeParticipants.length === 0 ? <p className="attendance-empty">No participants match these filters.</p> : (
          <div className="attendance-table-wrap"><table className="attendance-table">
            <thead><tr><th>Participant</th><th>Category</th><th>Status</th><th>Arrival time</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{activeParticipants.map((participant) => {
              const checkIn = checkInsByParticipant.get(participant.id)
              return <tr key={participant.id}>
                <td><strong>{participant.full_name}</strong><small>{participant.participant_code}</small></td>
                <td className="attendance-capitalize">{participant.category}</td>
                <td><span className={`attendance-badge ${checkIn ? 'checked' : 'waiting'}`}>{checkIn ? 'Checked in' : 'Expected'}</span></td>
                <td>{checkIn ? formatTime(checkIn.checked_in_at) : '—'}</td>
                <td>{checkIn ? <span className="attendance-recorded"><Check size={15} /> Recorded</span> : <button className="button-primary attendance-checkin" onClick={() => void checkInParticipant(participant)} disabled={savingId === participant.id}>{savingId === participant.id ? 'Saving…' : 'Check in'}</button>}</td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </section>
      <p className="attendance-footnote">Export creates a CSV file on this device that can be opened in Excel or Google Sheets. Check-in is recorded in EventFlow.</p>
    </div>
  )
}
