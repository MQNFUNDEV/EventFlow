import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Square,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './DevelopmentLog.css'

type Session = {
  id: string
  title: string
  started_at: string
  ended_at: string | null
  paused_at: string | null
  paused_seconds: number
  notes: string | null
}

type LogEntry = {
  id: string
  session_id: string | null
  title: string
  description: string
  status: 'completed' | 'in_progress' | 'blocked' | 'tested'
  category: string
  work_date: string
  time_precision: 'exact' | 'reconstructed' | 'date_only'
  occurred_at: string | null
  github_commit: string | null
  github_url: string | null
  supabase_reference: string | null
  created_at: string
}

type ReportNotes = { summary: string; completedWork: string; workingNotes: string; nextSteps: string }
const reportNotesPrefix = 'EVENTFLOW_REPORT_V1:'
const emptyReportNotes: ReportNotes = { summary: '', completedWork: '', workingNotes: '', nextSteps: '' }

function readReportNotes(value: string | null): ReportNotes {
  if (!value?.startsWith(reportNotesPrefix)) {
    return { ...emptyReportNotes, workingNotes: value ?? '' }
  }
  try {
    return { ...emptyReportNotes, ...JSON.parse(value.slice(reportNotesPrefix.length)) }
  } catch {
    return { ...emptyReportNotes, workingNotes: value }
  }
}

function writeReportNotes(notes: ReportNotes) {
  return `${reportNotesPrefix}${JSON.stringify(notes)}`
}

const timeZone = 'Asia/Kuala_Lumpur'

function formatDateTime(value: string | null) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-MY', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function getElapsedSeconds(session: Session, now: number) {
  const start = new Date(session.started_at).getTime()
  const finish = session.ended_at
    ? new Date(session.ended_at).getTime()
    : session.paused_at
      ? new Date(session.paused_at).getTime()
      : now

  return Math.max(
    0,
    Math.floor((finish - start) / 1000) - session.paused_seconds,
  )
}

function DevelopmentLog() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(0)

  const [sessionTitle, setSessionTitle] = useState('EventFlow Development Session')
  const [reportSummary, setReportSummary] = useState('')
  const [completedWork, setCompletedWork] = useState('')
  const [workingNotes, setWorkingNotes] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [entryTitle, setEntryTitle] = useState('')
  const [entryDescription, setEntryDescription] = useState('')
  const [entryCategory, setEntryCategory] = useState('development')
  const [entryStatus, setEntryStatus] =
    useState<LogEntry['status']>('in_progress')
  const [githubCommit, setGithubCommit] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [supabaseReference, setSupabaseReference] = useState('')

  const loadData = useCallback(async () => {
    setError('')

    const [sessionResult, entryResult] = await Promise.all([
      supabase
        .from('development_log_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('development_log_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (sessionResult.error) {
      setError(sessionResult.error.message)
      setLoading(false)
      return
    }

    if (entryResult.error) {
      setError(entryResult.error.message)
      setLoading(false)
      return
    }

    const loadedSessions = (sessionResult.data ?? []) as Session[]
    setSessions(loadedSessions)
    setEntries((entryResult.data ?? []) as LogEntry[])

    const runningSession = loadedSessions.find((session) => !session.ended_at)
    const preferredSession = runningSession ?? loadedSessions[0]

    setSelectedSessionId((current) => {
      if (current && loadedSessions.some((session) => session.id === current)) {
        return current
      }
      return preferredSession?.id ?? ''
    })

    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchInitialData() {
      const [sessionResult, entryResult] = await Promise.all([
        supabase
          .from('development_log_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('development_log_entries')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      if (cancelled) return

      if (sessionResult.error) {
        setError(sessionResult.error.message)
      } else if (entryResult.error) {
        setError(entryResult.error.message)
      } else {
        const loadedSessions = (sessionResult.data ?? []) as Session[]
        setSessions(loadedSessions)
        setEntries((entryResult.data ?? []) as LogEntry[])

        const preferredSession =
          loadedSessions.find((session) => !session.ended_at) ??
          loadedSessions[0]

        setSelectedSessionId(preferredSession?.id ?? '')
        const notes = readReportNotes(preferredSession?.notes ?? null)
        setReportSummary(notes.summary)
        setCompletedWork(notes.completedWork)
        setWorkingNotes(notes.workingNotes)
        setNextSteps(notes.nextSteps)
      }

      setLoading(false)
    }

    void fetchInitialData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  const isRunning = Boolean(selectedSession && !selectedSession.ended_at)
  const isPaused = Boolean(isRunning && selectedSession?.paused_at)

  const elapsedSeconds = selectedSession
    ? getElapsedSeconds(selectedSession, tick)
    : 0


  const sessionEntries = entries.filter(
    (entry) => entry.session_id === selectedSessionId,
  )
  const reportDraft = useMemo(() => {
    const completed = sessionEntries.filter((entry) => entry.status === 'completed')
    const tested = sessionEntries.filter((entry) => entry.status === 'tested')
    const inProgress = sessionEntries.filter((entry) => entry.status === 'in_progress')
    const blocked = sessionEntries.filter((entry) => entry.status === 'blocked')
    return {
      completed: completed.map((entry) => entry.title),
      tested: tested.map((entry) => entry.title),
      inProgress: inProgress.map((entry) => entry.title),
      blocked: blocked.map((entry) => entry.title),
      completedCount: completed.length,
      testedCount: tested.length,
      inProgressCount: inProgress.length,
      blockedCount: blocked.length,
    }
  }, [sessionEntries])
  const generatedSummary = useMemo(() => {
    if (!sessionEntries.length) return 'No work entries were recorded for this session.'
    const parts = [
      reportDraft.completed.length ? `Completed: ${reportDraft.completed.join('; ')}.` : '',
      reportDraft.tested.length ? `Tested: ${reportDraft.tested.join('; ')}.` : '',
      reportDraft.inProgress.length ? `In progress: ${reportDraft.inProgress.join('; ')}.` : '',
      reportDraft.blocked.length ? `Blocked: ${reportDraft.blocked.join('; ')}.` : '',
    ].filter(Boolean)
    return `Based on ${sessionEntries.length} recorded work entr${sessionEntries.length === 1 ? 'y' : 'ies'}. ${parts.join(' ')}`
  }, [reportDraft, sessionEntries])
  const generatedWorkingNotes = useMemo(() => {
    if (!sessionEntries.length) return 'No work entries were recorded. Add a work entry to create an automatic handover draft.'
    return sessionEntries.slice().reverse().map((entry) => {
      const status = entry.status.replace('_', ' ')
      return `• ${entry.title} (${status})${entry.description ? ` — ${entry.description}` : ''}`
    }).join('\n')
  }, [sessionEntries])
  const technicalReferences = useMemo(() => sessionEntries.flatMap((entry) => {
    if (!entry.github_commit && !entry.github_url && !entry.supabase_reference) return []
    return [{ id: entry.id, title: entry.title, commit: entry.github_commit, url: entry.github_url, supabase: entry.supabase_reference }]
  }), [sessionEntries])

  function updateReportEditors(value: string | null) {
    const notes = readReportNotes(value)
    setReportSummary(notes.summary)
    setCompletedWork(notes.completedWork)
    setWorkingNotes(notes.workingNotes)
    setNextSteps(notes.nextSteps)
  }

  async function saveReportNotes() {
    if (!selectedSession) return
    setSaving(true)
    setError('')
    const notes = { summary: reportSummary.trim(), completedWork: completedWork.trim(), workingNotes: workingNotes.trim(), nextSteps: nextSteps.trim() }
    const { error: updateError } = await supabase
      .from('development_log_sessions')
      .update({ notes: writeReportNotes(notes) })
      .eq('id', selectedSession.id)
    if (updateError) setError(updateError.message)
    else {
      setMessage('Report sections saved.')
      await loadData()
    }
    setSaving(false)
  }

  async function startSession() {
    setSaving(true)
    setError('')
    setMessage('')

    // Prevent a second active or paused session.
    const { data: activeSessions, error: activeCheckError } = await supabase
      .from('development_log_sessions')
      .select('id')
      .is('ended_at', null)
      .limit(1)

    if (activeCheckError) {
      setError(activeCheckError.message)
      setSaving(false)
      return
    }

    if (activeSessions && activeSessions.length > 0) {
      setError('An active or paused session already exists. Resume or end it before starting another.')
      await loadData()
      setSelectedSessionId(activeSessions[0].id)
      setSaving(false)
      return
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Unable to identify the signed-in user.')
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('development_log_sessions')
      .insert({
        title: sessionTitle.trim() || 'EventFlow Development Session',
        created_by: userData.user.id,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setMessage('Development session started.')
      setSessionTitle('EventFlow Development Session')
      await loadData()
      if (data?.id) {
        setSelectedSessionId(data.id)
        setReportSummary('')
        setCompletedWork('')
        setWorkingNotes('')
        setNextSteps('')
      }
    }

    setSaving(false)
  }

  async function pauseSession() {
    if (!selectedSession) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('development_log_sessions')
      .update({ paused_at: new Date().toISOString() })
      .eq('id', selectedSession.id)
      .is('ended_at', null)
      .is('paused_at', null)

    if (updateError) setError(updateError.message)
    else {
      setMessage('Session paused.')
      await loadData()
    }

    setSaving(false)
  }

  async function resumeSession() {
    if (!selectedSession?.paused_at) return

    setSaving(true)
    setError('')

    const pausedDuration = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(selectedSession.paused_at).getTime()) / 1000,
      ),
    )

    const { error: updateError } = await supabase
      .from('development_log_sessions')
      .update({
        paused_at: null,
        paused_seconds: selectedSession.paused_seconds + pausedDuration,
      })
      .eq('id', selectedSession.id)
      .is('ended_at', null)

    if (updateError) setError(updateError.message)
    else {
      setMessage('Session resumed.')
      await loadData()
    }

    setSaving(false)
  }

  async function endSession() {
    if (!selectedSession) return

    const confirmed = window.confirm(
      'End this development session? The recorded session duration will be finalised.',
    )
    if (!confirmed) return

    setSaving(true)
    setError('')

    let finalPausedSeconds = selectedSession.paused_seconds

    if (selectedSession.paused_at) {
      finalPausedSeconds += Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(selectedSession.paused_at).getTime()) / 1000,
        ),
      )
    }

    const { error: updateError } = await supabase
      .from('development_log_sessions')
      .update({
        ended_at: new Date().toISOString(),
        paused_at: null,
        paused_seconds: finalPausedSeconds,
        notes: writeReportNotes({ summary: reportSummary.trim(), completedWork: completedWork.trim(), workingNotes: workingNotes.trim() || generatedWorkingNotes, nextSteps: nextSteps.trim() }),
      })
      .eq('id', selectedSession.id)
      .is('ended_at', null)

    if (updateError) setError(updateError.message)
    else {
      setMessage('Session ended and saved.')
      await loadData()
    }

    setSaving(false)
  }

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedSession || !isRunning) {
      setError('Start or select an active session before adding a work entry.')
      return
    }

    if (isPaused) {
      setError('Resume the session before adding a work entry.')
      return
    }

    if (!entryTitle.trim() || !entryDescription.trim()) {
      setError('Enter both a task title and a work description.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setError(userError?.message ?? 'Unable to identify the signed-in user.')
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase
      .from('development_log_entries')
      .insert({
        session_id: selectedSession.id,
        title: entryTitle.trim(),
        description: entryDescription.trim(),
        category: entryCategory,
        status: entryStatus,
        time_precision: 'exact',
        occurred_at: new Date().toISOString(),
        created_by: userData.user.id,
        github_commit: githubCommit.trim() || null,
        github_url: githubUrl.trim() || null,
        supabase_reference: supabaseReference.trim() || null,
      })

    if (insertError) {
      setError(insertError.message)
    } else {
      setMessage('Work entry saved with a Malaysia-time timestamp.')
      setEntryTitle('')
      setEntryDescription('')
      setGithubCommit('')
      setGithubUrl('')
      setSupabaseReference('')
      await loadData()
    }

    setSaving(false)
  }

  return (
    <div className="development-log">
      <div className="devlog-intro">
        <div>
          <div className="devlog-eyebrow">
            <BookOpen size={15} /> PRIVATE ADMINISTRATIVE RECORD
          </div>
          <h2>Development &amp; Overtime Log</h2>
          <p>
            Record development work, testing, technical changes and session
            duration. All displayed times use Malaysia time (MYT, UTC+8).
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={() => void loadData()}
          disabled={loading || saving}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="devlog-alert error">{error}</div>}
      {message && <div className="devlog-alert success">{message}</div>}

      <section className="panel devlog-session-panel">
        <div className="devlog-section-heading">
          <div>
            <h3>Work session timer</h3>
            <p>Start tracking when you begin work. Pause during breaks.</p>
          </div>
          <span className="devlog-timezone">MYT · UTC+8</span>
        </div>

        {selectedSession && (
          <div className="devlog-active-session">
            <div>
              <span className="devlog-muted">Selected session</span>
              <strong>{selectedSession.title}</strong>
              <span className="devlog-muted">
                Started: {formatDateTime(selectedSession.started_at)}
              </span>
            </div>
            <div className="devlog-timer">
              <Clock3 size={18} />
              <strong>{formatDuration(elapsedSeconds)}</strong>
              <span>{selectedSession.ended_at ? 'Ended' : isPaused ? 'Paused' : 'Active time'}</span>
            </div>
          </div>
        )}

        {isRunning ? (
          <div className="devlog-session-actions">
            {isPaused ? (
              <button className="button-primary" onClick={() => void resumeSession()} disabled={saving}>
                <Play size={16} /> Resume session
              </button>
            ) : (
              <button className="button-secondary" onClick={() => void pauseSession()} disabled={saving}>
                <Pause size={16} /> Pause
              </button>
            )}
            <button className="button-danger" onClick={() => void endSession()} disabled={saving}>
              <Square size={15} /> End session
            </button>
          </div>
        ) : (
          <div className="devlog-start-session">
            <label htmlFor="devlog-session-title">New session title</label>
            <input
              id="devlog-session-title"
              value={sessionTitle}
              onChange={(event) => setSessionTitle(event.target.value)}
              placeholder="e.g. EventFlow development - 17 Nov"
              maxLength={120}
            />
            <button className="button-primary" onClick={() => void startSession()} disabled={saving}>
              <Play size={16} /> Start session
            </button>
          </div>
        )}

        {selectedSession && (
          <div className="devlog-handover-editor">
            <p className="devlog-editor-intro">Drafts below are based only on entries recorded in this session. Edit them for your team, then save at any time.</p>
            <label htmlFor="devlog-session-summary">Plain-language session summary</label>
            <textarea
              id="devlog-session-summary"
              value={reportSummary || generatedSummary}
              onChange={(event) => setReportSummary(event.target.value)}
              placeholder="A short update that a non-technical teammate can understand."
              rows={3}
              maxLength={10000}
            />
            <label htmlFor="devlog-completed-work">Completed work for the report</label>
            <textarea
              id="devlog-completed-work"
              value={completedWork || reportDraft.completed.join('\n')}
              onChange={(event) => setCompletedWork(event.target.value)}
              placeholder="Completed work will be drafted from entries marked completed. You can edit this list."
              rows={3}
              maxLength={10000}
            />
            <label htmlFor="devlog-working-notes">Working notes</label>
            <textarea id="devlog-working-notes" value={workingNotes || generatedWorkingNotes} onChange={(event) => setWorkingNotes(event.target.value)} placeholder="Context, decisions, or details useful to the next person." rows={5} maxLength={10000} />
            <label htmlFor="devlog-next-steps">Next steps</label>
            <textarea id="devlog-next-steps" value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} placeholder="What should happen next? Leave blank if no next step is known." rows={3} maxLength={10000} />
            <button className="button-secondary" onClick={() => void saveReportNotes()} disabled={saving}><Save size={16} /> Save report sections</button>
          </div>
        )}

        {selectedSession?.ended_at && (
          <div className="devlog-report-actions">
            <button
              className="button-primary"
              onClick={() => window.print()}
            >
              Generate PDF report
            </button>
            <span>Choose “Save as PDF” in the print window.</span>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="devlog-session-select">
            <label htmlFor="devlog-session-select">Choose a recorded session</label>
            <select
              id="devlog-session-select"
              value={selectedSessionId}
              onChange={(event) => {
                const nextId = event.target.value
                const nextSession = sessions.find((session) => session.id === nextId)
                setSelectedSessionId(nextId)
                updateReportEditors(nextSession?.notes ?? null)
              }}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title} — {formatDateTime(session.started_at)}
                  {session.ended_at ? ' (ended)' : session.paused_at ? ' (paused)' : ' (active)'}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="panel devlog-entry-panel">
        <div className="devlog-section-heading">
          <div>
            <h3>Add work entry</h3>
            <p>Each entry is timestamped when you save it.</p>
          </div>
          <CheckCircle2 size={20} className="devlog-heading-icon" />
        </div>

        <form onSubmit={addEntry} className="devlog-form">
          <div className="devlog-form-grid">
            <div className="devlog-field devlog-field-wide">
              <label htmlFor="devlog-entry-title">Task title</label>
              <input
                id="devlog-entry-title"
                value={entryTitle}
                onChange={(event) => setEntryTitle(event.target.value)}
                placeholder="e.g. Implement participant CSV import"
                maxLength={160}
                required
              />
            </div>

            <div className="devlog-field">
              <label htmlFor="devlog-category">Work category</label>
              <select id="devlog-category" value={entryCategory} onChange={(event) => setEntryCategory(event.target.value)}>
                <option value="development">Development</option>
                <option value="testing">Testing</option>
                <option value="database">Database</option>
                <option value="security">Security</option>
                <option value="deployment">Deployment</option>
                <option value="documentation">Documentation</option>
                <option value="planning">Planning</option>
              </select>
            </div>

            <div className="devlog-field">
              <label htmlFor="devlog-status">Status</label>
              <select id="devlog-status" value={entryStatus} onChange={(event) => setEntryStatus(event.target.value as LogEntry['status'])}>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="tested">Tested</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <div className="devlog-field devlog-field-wide">
              <label htmlFor="devlog-description">Work description</label>
              <textarea
                id="devlog-description"
                value={entryDescription}
                onChange={(event) => setEntryDescription(event.target.value)}
                placeholder="Describe what was changed, why it was needed, and the outcome or test result."
                rows={4}
                required
              />
            </div>

            <div className="devlog-field">
              <label htmlFor="devlog-github-commit">GitHub commit hash</label>
              <input id="devlog-github-commit" value={githubCommit} onChange={(event) => setGithubCommit(event.target.value)} placeholder="e.g. bea74d5" />
            </div>

            <div className="devlog-field">
              <label htmlFor="devlog-github-url">GitHub commit URL</label>
              <input id="devlog-github-url" type="url" value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/..." />
            </div>

            <div className="devlog-field devlog-field-wide">
              <label htmlFor="devlog-supabase-reference">Supabase reference</label>
              <input id="devlog-supabase-reference" value={supabaseReference} onChange={(event) => setSupabaseReference(event.target.value)} placeholder="Migration name, table, policy, Edge Function or SQL change" />
            </div>
          </div>

          <div className="devlog-form-footer">
            <span>
              {isPaused
                ? 'Resume the session to add entries.'
                : isRunning
                  ? 'Entry timestamp will be recorded automatically.'
                  : 'Start a session before adding a work entry.'}
            </span>
            <button className="button-primary" type="submit" disabled={saving || !isRunning || isPaused}>
              <Plus size={17} /> Save work entry
            </button>
          </div>
        </form>
      </section>

      <section className="panel devlog-history-panel">
        <div className="devlog-section-heading">
          <div>
            <h3>Session work history</h3>
            <p>{sessionEntries.length} entries in the selected session</p>
          </div>
        </div>

        {loading ? (
          <p className="devlog-empty">Loading development records...</p>
        ) : sessionEntries.length === 0 ? (
          <p className="devlog-empty">No work entries recorded for this session yet.</p>
        ) : (
          <div className="devlog-entry-list">
            {sessionEntries.map((entry) => (
              <article className="devlog-entry" key={entry.id}>
                <div className="devlog-entry-top">
                  <div>
                    <span className={`devlog-status status-${entry.status}`}>
                      {entry.status.replace('_', ' ')}
                    </span>
                    <h4>{entry.title}</h4>
                  </div>
                  <time>{formatDateTime(entry.occurred_at ?? entry.created_at)}</time>
                </div>
                <p>{entry.description}</p>
                <div className="devlog-entry-meta">
                  <span>{entry.category}</span>
                  {entry.github_commit && <span>GitHub: {entry.github_commit}</span>}
                  {entry.github_url && <a href={entry.github_url} target="_blank" rel="noreferrer">View commit</a>}
                  {entry.supabase_reference && <span>Supabase: {entry.supabase_reference}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedSession?.ended_at && (
        <section className="devlog-print-report">
          <header className="devlog-report-header">
            <div className="devlog-report-brand">MAQNA EVENTFLOW</div>
            <h1>Development Work Session Report</h1>
            <p>Project: EventFlow Attendance System</p>
            <p>Timezone: Malaysia Time (MYT, UTC+8)</p>
          </header>

          <section className="devlog-report-section">
            <h2>Session details</h2>
            <dl className="devlog-report-details">
              <div>
                <dt>Session title</dt>
                <dd>{selectedSession.title}</dd>
              </div>
              <div>
                <dt>Start time</dt>
                <dd>{formatDateTime(selectedSession.started_at)}</dd>
              </div>
              <div>
                <dt>End time</dt>
                <dd>{formatDateTime(selectedSession.ended_at)}</dd>
              </div>
              <div>
                <dt>Recorded active duration</dt>
                <dd>{formatDuration(elapsedSeconds)}</dd>
              </div>
              <div>
                <dt>Total paused time</dt>
                <dd>{formatDuration(selectedSession.paused_seconds)}</dd>
              </div>
              <div>
                <dt>Work entries</dt>
                <dd>{sessionEntries.length}</dd>
              </div>
            </dl>
          </section>

          <section className="devlog-report-section">
            <h2>Session overview</h2>
            <p className="devlog-report-notes">{reportSummary.trim() || generatedSummary}</p>
          </section>

          <section className="devlog-report-section">
            <h2>Project progress snapshot</h2>
            <p>Based on work entries recorded in this session. This log does not assess the full site or independently verify each status.</p>
            <ul>
              <li>{reportDraft.completedCount} marked complete</li>
              <li>{reportDraft.testedCount} marked tested</li>
              <li>{reportDraft.inProgressCount} in progress</li>
              <li>{reportDraft.blockedCount} blocked</li>
            </ul>
            <p>Overall site progress: not assessed from this session record.</p>
          </section>

          <section className="devlog-report-section">
            <h2>Completed work</h2>
            {completedWork.trim() ? <p className="devlog-report-notes">{completedWork}</p> : reportDraft.completed.length ? <ul>{reportDraft.completed.map((title) => <li key={title}>{title}</li>)}</ul> : <p>No entries marked completed.</p>}
          </section>
          <section className="devlog-report-section">
            <h2>Tested and confirmed</h2>
            {reportDraft.tested.length ? <ul>{reportDraft.tested.map((title) => <li key={title}>{title}</li>)}</ul> : <p>No entries marked tested.</p>}
          </section>
          <section className="devlog-report-section">
            <h2>Work in progress and blockers</h2>
            {reportDraft.inProgress.length || reportDraft.blocked.length ? <ul>{[...reportDraft.inProgress.map((title) => `In progress: ${title}`), ...reportDraft.blocked.map((title) => `Blocked: ${title}`)].map((title) => <li key={title}>{title}</li>)}</ul> : <p>No unfinished or blocked work was recorded.</p>}
          </section>
          <section className="devlog-report-section">
            <h2>Next steps</h2>
            <p className="devlog-report-notes">{nextSteps.trim() || 'No next steps recorded.'}</p>
          </section>

          <section className="devlog-report-section">
            <h2>Detailed work record</h2>
            {sessionEntries.length === 0 ? (
              <p>No individual work entries were recorded.</p>
            ) : (
              [...sessionEntries]
                .reverse()
                .map((entry) => (
                  <article className="devlog-report-entry" key={entry.id}>
                    <h3>{entry.title}</h3>
                    <p className="devlog-report-entry-meta">
                      {formatDateTime(entry.occurred_at ?? entry.created_at)}
                      {' · '}
                      {entry.category}
                      {' · '}
                      {entry.status.replace('_', ' ')}
                    </p>
                    <p className="devlog-report-description">
                      {entry.description}
                    </p>
                  </article>
                ))
            )}
          </section>

          <section className="devlog-report-section">
            <h2>Technical records</h2>
            {technicalReferences.length ? (
              <>
                <p>References entered with the work records; they have not been independently verified by this report.</p>
                {technicalReferences.map((reference) => (
                  <p className="devlog-report-reference" key={reference.id}>
                    <strong>{reference.title}:</strong>{' '}
                    {reference.commit && <>GitHub commit {reference.commit}. </>}
                    {reference.url && <><a href={reference.url}>{reference.url}</a>. </>}
                    {reference.supabase && <>Supabase: {reference.supabase}.</>}
                  </p>
                ))}
              </>
            ) : <p>No GitHub or Supabase references were recorded for this session.</p>}
          </section>

          <section className="devlog-report-section">
            <h2>Summary and handover</h2>
            <p className="devlog-report-notes">
              {workingNotes.trim() || readReportNotes(selectedSession.notes).workingNotes.trim() || generatedWorkingNotes ||
                'No handover notes were recorded for this session.'}
            </p>
          </section>

          <footer className="devlog-report-footer">
            <p>
              Generated from the EventFlow Development Log. Times and
              durations reflect the records saved in the system.
            </p>
            <p>
              This report documents user-recorded activity and is not
              independent verification of work performed.
            </p>
          </footer>
        </section>
      )}

      <p className="devlog-footnote">
        This log records activity from the time tracking is started. It does not
        independently verify work performed before tracking began. Historical
        work must be clearly marked as reconstructed.
      </p>
    </div>
  )
}

export default DevelopmentLog




