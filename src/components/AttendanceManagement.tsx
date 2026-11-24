import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories, categoryName, type ParticipantCategory } from '../lib/participantCategories'
import './AttendanceManagement.css'
import { DEFAULT_IC_REGION_RULE, isIcRegionEligible, type IcRegionRule } from '../lib/icRegionEligibility'

type Participant = {
  id: string
  participant_code: string
  full_name: string
  email: string | null
  phone: string | null
  ic_number: string | null
  category: string
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

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { data: rows, error: null }
  }
}

export default function AttendanceManagement() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [categories, setCategories] = useState<ParticipantCategory[]>(DEFAULT_PARTICIPANT_CATEGORIES)
  const [icRegionRule, setIcRegionRule] = useState<IcRegionRule>(DEFAULT_IC_REGION_RULE)
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50
  const [category, setCategory] = useState('all')
  const [view, setView] = useState<'all' | 'checked_in' | 'waiting'>('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const loadData = useCallback(async () => {
    setError('')
    const [participantResult, checkInResult] = await Promise.all([
      fetchAllPages<Participant>((from, to) => supabase.from('participants').select('id, participant_code, full_name, email, phone, ic_number, category, is_active').eq('is_active', true).order('full_name').order('id').range(from, to)),
      fetchAllPages<CheckIn>((from, to) => supabase.from('attendance').select('participant_id, checked_in_at, checked_in_by, check_in_method').order('checked_in_at', { ascending: false }).order('participant_id').range(from, to)),
    ])
    if (participantResult.error) setError(participantResult.error.message)
    else setParticipants(participantResult.data)
    const checkInLoadError = checkInResult.error
    if (checkInLoadError) setError((current) => current ? `${current} ${checkInLoadError.message}` : checkInLoadError.message)
    else setCheckIns(checkInResult.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void supabase.from('display_state').select('payload').eq('id', 1).maybeSingle().then(({ data }) => {
      if (cancelled) return
      setCategories(readParticipantCategories(data?.payload))
      const payload = data?.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : {}
      const savedRule = payload.ic_region_rule as { enabled?: unknown; allowed_codes?: unknown } | undefined
      const savedCodes = Array.isArray(savedRule?.allowed_codes) ? savedRule.allowed_codes.filter((code): code is string => typeof code === 'string' && /^\d{2}$/.test(code)) : DEFAULT_IC_REGION_RULE.allowed_codes
      setIcRegionRule({ enabled: typeof savedRule?.enabled === 'boolean' ? savedRule.enabled : DEFAULT_IC_REGION_RULE.enabled, allowed_codes: savedCodes.length ? savedCodes : DEFAULT_IC_REGION_RULE.allowed_codes })
    })
    async function initialLoad() {
      const [participantResult, checkInResult] = await Promise.all([
        fetchAllPages<Participant>((from, to) => supabase.from('participants').select('id, participant_code, full_name, email, phone, ic_number, category, is_active').eq('is_active', true).order('full_name').order('id').range(from, to)),
        fetchAllPages<CheckIn>((from, to) => supabase.from('attendance').select('participant_id, checked_in_at, checked_in_by, check_in_method').order('checked_in_at', { ascending: false }).order('participant_id').range(from, to)),
      ])
      if (cancelled) return
      if (participantResult.error) setError(participantResult.error.message)
      else setParticipants(participantResult.data)
      const checkInLoadError = checkInResult.error
      if (checkInLoadError) setError((current) => current ? `${current} ${checkInLoadError.message}` : checkInLoadError.message)
      else setCheckIns(checkInResult.data)
      setLoading(false)
    }
    void initialLoad()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('eventflow-attendance-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_state' }, () => {
        void supabase.from('display_state').select('payload').eq('id', 1).maybeSingle().then(({ data }) => {
          const payload = data?.payload && typeof data.payload === 'object' ? data.payload as Record<string, unknown> : {}
          const savedRule = payload.ic_region_rule as { enabled?: unknown; allowed_codes?: unknown } | undefined
          const savedCodes = Array.isArray(savedRule?.allowed_codes) ? savedRule.allowed_codes.filter((code): code is string => typeof code === 'string' && /^\d{2}$/.test(code)) : DEFAULT_IC_REGION_RULE.allowed_codes
          setIcRegionRule({ enabled: typeof savedRule?.enabled === 'boolean' ? savedRule.enabled : DEFAULT_IC_REGION_RULE.enabled, allowed_codes: savedCodes.length ? savedCodes : DEFAULT_IC_REGION_RULE.allowed_codes })
          setCategories(readParticipantCategories(data?.payload))
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  const checkInsByParticipant = useMemo(
    () => new Map(checkIns.map((checkIn) => [checkIn.participant_id, checkIn])),
    [checkIns],
  )
  const activeParticipants = useMemo(() => {
    const term = search.trim().toLowerCase()
    return participants.filter((participant) => {
      const checkIn = checkInsByParticipant.get(participant.id)
      const matchesSearch = !term || [participant.full_name, participant.participant_code, participant.ic_number, participant.email, participant.phone]
        .some((field) => field?.toLowerCase().includes(term))
      return matchesSearch && (category === 'all' || participant.category === category) &&
        (view === 'all' || (view === 'checked_in' ? Boolean(checkIn) : !checkIn))
    })
  }, [participants, checkInsByParticipant, search, category, view])
  const checkedInCount = participants.filter((participant) => checkInsByParticipant.has(participant.id)).length
  const totalPages = Math.max(1, Math.ceil(activeParticipants.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedParticipants = activeParticipants.slice((safePage - 1) * pageSize, safePage * pageSize)

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
    const categoryOrder = new Map(categories.map((item, index) => [item.id, index]))
    const orderedParticipants = [...participants].sort((a, b) => {
      const categoryDifference =
        (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER)
      return categoryDifference || a.full_name.localeCompare(b.full_name, 'en', { sensitivity: 'base' })
    })
    const rows = [
      ['Participant code', 'Name', 'Category', 'Email', 'Phone', 'Attendance status', 'Check-in time (MYT)', 'Method'],
      ...orderedParticipants.map((participant) => {
        const checkIn = checkInsByParticipant.get(participant.id)
        return [participant.participant_code, participant.full_name, categoryName(categories, participant.category), participant.email ?? '', participant.phone ?? '', checkIn ? 'Checked in' : 'Not checked in', checkIn ? new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(checkIn.checked_in_at)) : '', checkIn?.check_in_method ?? '']
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
      <div className="attendance-heading attendance-heading-actions">
          <button className="button-secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
          <button className="button-secondary" onClick={exportCsv} disabled={loading || participants.length === 0}><Download size={16} /> Export CSV</button>
      </div>

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
          <label className="attendance-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Search name, code, email or phone" /></label>
          <select aria-label="Filter by category" value={category} onChange={(event) => { setCategory(event.target.value); setCurrentPage(1) }}>
            <option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label="Filter by attendance status" value={view} onChange={(event) => { setView(event.target.value as typeof view); setCurrentPage(1) }}>
            <option value="all">Everyone</option><option value="waiting">Not checked in</option><option value="checked_in">Checked in</option>
          </select>
        </div>

        {loading ? <p className="attendance-empty">Loading attendance…</p> : activeParticipants.length === 0 ? <p className="attendance-empty">No participants match these filters.</p> : (
          <div className="attendance-table-wrap"><table className="attendance-table">
            <thead><tr><th>Participant / IC</th><th>Category</th><th>Status</th><th>Arrival time</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{paginatedParticipants.slice(0, pageSize).map((participant) => {
              const checkIn = checkInsByParticipant.get(participant.id)
              return <tr key={participant.id}>
                <td>
                  <strong className={icRegionRule.enabled && !isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes) ? 'attendance-ic-ineligible' : undefined}>{participant.full_name}</strong>
                  <small className="attendance-participant-code">{participant.participant_code}</small>
                  <small className={icRegionRule.enabled && !isIcRegionEligible(participant.ic_number, icRegionRule.allowed_codes) ? 'attendance-ic-number attendance-ic-ineligible' : 'attendance-ic-number'}>IC: {participant.ic_number || 'Not provided'}</small>
                </td>
                <td className="attendance-capitalize">{categoryName(categories, participant.category)}</td>
                <td><span className={`attendance-badge ${checkIn ? 'checked' : 'waiting'}`}>{checkIn ? 'Checked in' : 'Expected'}</span></td>
                <td>{checkIn ? formatTime(checkIn.checked_in_at) : '—'}</td>
                <td>{checkIn ? <span className="attendance-recorded"><Check size={15} /> Recorded</span> : <button className="button-primary attendance-checkin" onClick={() => void checkInParticipant(participant)} disabled={savingId === participant.id}>{savingId === participant.id ? 'Saving…' : 'Check in'}</button>}</td>
              </tr>
            })}</tbody>
          </table></div>
        )}
        {!loading && activeParticipants.length > 0 && (
          <div className="attendance-pagination">
            <span>Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, activeParticipants.length)} of {activeParticipants.length}</span>
            <div>
              <button type="button" className="button-secondary" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>First</button>
              <button type="button" className="button-secondary" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1}>Previous</button>
              <span>Page {safePage} of {totalPages}</span>
              <button type="button" className="button-secondary" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages}>Next</button>
              <button type="button" className="button-secondary" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>Last</button>
            </div>
          </div>
        )}
      </section>
      <p className="attendance-footnote">Export creates a CSV file on this device that can be opened in Excel or Google Sheets. Check-in is recorded in EventFlow.</p>
    </div>
  )
}
