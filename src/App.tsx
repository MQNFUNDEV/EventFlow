import { lazy, Suspense, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Gift,
  Monitor,
  Settings,
  ArrowUpRight,
  Activity,
  Menu,
  X,
  CircleHelp,
  CheckCircle2,
  MoreHorizontal,
  LogOut,
  BookOpen,
  Clock3,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import HiveMindPanel from './components/HiveMindPanel'
import { DEFAULT_PARTICIPANT_CATEGORIES, readParticipantCategories } from './lib/participantCategories'
import './App.css'

declare const __APP_VERSION__: string

const AdminManagement = lazy(() => import('./components/AdminManagement'))
const ParticipantManagement = lazy(() => import('./components/ParticipantManagement'))
const AttendanceManagement = lazy(() => import('./components/AttendanceManagement'))
const DevelopmentLog = lazy(() => import('./components/DevelopmentLog'))
const LedDisplayControl = lazy(() => import('./components/LedDisplayControl'))
const LedDisplayOutput = lazy(() => import('./components/LedDisplayOutput'))
const EventSettings = lazy(() => import('./components/EventSettings'))
const LuckyDrawManagement = lazy(() => import('./components/LuckyDrawManagement'))

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, group: 'MAIN' },
  { label: 'Participants', icon: Users, group: 'MAIN' },
  { label: 'Attendance', icon: ClipboardCheck, group: 'MAIN' },
  { label: 'Lucky Draw', icon: Gift, group: 'EVENT' },
  { label: 'LED Display', icon: Monitor, group: 'MANAGEMENT' },
  { label: 'Settings', icon: Settings, group: 'MANAGEMENT' },
  { label: 'Admin Management', icon: Users, group: 'MANAGEMENT' },
  { label: 'Development Log', icon: BookOpen, group: 'MANAGEMENT' },
]

const rolePageAccess: Record<string, string[]> = {
  super_admin: [
    'Overview',
    'Participants',
    'Attendance',
    'Lucky Draw',
    'LED Display',
    'Settings',
    'Admin Management',
    'Development Log',
  ],
  event_admin: [
    'Overview',
    'Participants',
    'Attendance',
    'Lucky Draw',
    'LED Display',
    'Settings',
    'Admin Management',
  ],
  front_desk: [
    'Overview',
    'Participants',
    'Attendance',
  ],
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  event_admin: 'Event Admin',
  front_desk: 'Front Desk',
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

type RecentActivityItem = {
  id: string
  type: 'checkin' | 'winner'
  full_name: string
  category: string
  occurred_at: string
  detail?: string
}

type DashboardMetrics = {
  totalParticipants: number
  checkedIn: number
  categoryStats: { id: string; name: string; total: number; checkedIn: number }[]
  recentActivity: RecentActivityItem[]
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const pageDescription: Record<string, string> = {
  Overview: 'Monitor your event at a glance.',
  Participants: 'Manage participant registrations and their details.',
  Attendance: 'Track arrivals and manage event check-in.',
  'Lucky Draw': 'Manage draw rounds and announce winners.',
  'LED Display': 'Control what appears on your event display.',
  Settings: 'Configure your event and administrator access.',
  'Admin Management': 'Create and manage EventFlow administrator accounts.',
  'Development Log': 'Record development work, technical changes and session duration.',
}

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [roleLoading, setRoleLoading] = useState(true)
  const [roleError, setRoleError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardReload, setDashboardReload] = useState(0)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [localTime, setLocalTime] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setLocalTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!currentRole) return
    let cancelled = false

    async function loadConfiguredEventName() {
      const { data, error } = await supabase
        .from('display_state')
        .select('payload')
        .eq('id', 1)
        .maybeSingle()

      if (cancelled || error) return
      const payload = data?.payload
      const configuredName = payload && typeof payload === 'object' && 'event_name' in payload
        ? (payload as { event_name?: unknown }).event_name
        : null
      setEventName(typeof configuredName === 'string' ? configuredName.trim() : '')
    }

    void loadConfiguredEventName()

    const channel = supabase
      .channel('event-settings-name')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_state', filter: 'id=eq.1' }, () => {
        void loadConfiguredEventName()
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [currentRole])

  useEffect(() => {
    if (!currentRole || activePage !== 'Overview') return
    let cancelled = false
    async function loadDashboardMetrics() {
      setDashboardLoading(true)
      setDashboardError('')
      const [total, checkedIn, recent, recentWinners, eventSettings, categoryParticipants, categoryAttendance] = await Promise.all([
        supabase.from('participants').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('attendance').select('participant_id, participants!inner(id)', { count: 'exact', head: true }).eq('participants.is_active', true),
        supabase.from('attendance').select('participant_id, checked_in_at, participants!inner(full_name, category, is_active)').eq('participants.is_active', true).order('checked_in_at', { ascending: false }).limit(5),
        supabase.from('draw_winners').select('id, drawn_at, notes, status, participants!inner(full_name, category), draw_rounds!inner(name, pool_type)').eq('notes', 'Confirmed by operator').order('drawn_at', { ascending: false }).limit(5),
        supabase.from('display_state').select('payload').eq('id', 1).maybeSingle(),
        fetchAllPages<{ category: string }>((from, to) => supabase.from('participants').select('category').eq('is_active', true).order('id').range(from, to)),
        fetchAllPages<{ participants: { category: string; is_active: boolean } | { category: string; is_active: boolean }[] | null }>((from, to) => supabase.from('attendance').select('participants!inner(category, is_active)').eq('participants.is_active', true).order('participant_id').range(from, to)),
      ])
      if (cancelled) return
      const payload = eventSettings.data?.payload
      if (payload && typeof payload === 'object') {
        setEventName(typeof payload.event_name === 'string' ? payload.event_name.trim() : '')
        setEventDate(typeof payload.event_date === 'string' ? payload.event_date.trim() : '')
        setEventLocation(typeof payload.event_location === 'string' ? payload.event_location.trim() : '')
      }
      const queryError = total.error ?? checkedIn.error ?? recent.error ?? recentWinners.error ?? categoryParticipants.error ?? categoryAttendance.error
      if (queryError) {
        setDashboardError(queryError.message)
        setDashboardMetrics(null)
      } else {
        const checkInActivity: RecentActivityItem[] = (recent.data ?? []).flatMap((activity) => {
          const participant = Array.isArray(activity.participants) ? activity.participants[0] : activity.participants
          return participant ? [{
            id: `checkin-${activity.participant_id}-${activity.checked_in_at}`,
            type: 'checkin' as const,
            full_name: participant.full_name,
            category: participant.category,
            occurred_at: activity.checked_in_at,
          }] : []
        })
        const winnerActivity: RecentActivityItem[] = (recentWinners.data ?? []).flatMap((winner) => {
          const participant = Array.isArray(winner.participants) ? winner.participants[0] : winner.participants
          const round = Array.isArray(winner.draw_rounds) ? winner.draw_rounds[0] : winner.draw_rounds
          return participant ? [{
            id: `winner-${winner.id}`,
            type: 'winner' as const,
            full_name: participant.full_name,
            category: participant.category,
            occurred_at: winner.drawn_at,
            detail: round ? `${round.pool_type === 'everyone' ? 'Everyone' : `${round.pool_type[0].toUpperCase()}${round.pool_type.slice(1)}s`} draw · ${round.name}` : 'Lucky draw winner',
          }] : []
        })
        const categories = readParticipantCategories(payload)
        const participantCounts = new Map<string, number>()
        const attendanceCounts = new Map<string, number>()
        for (const row of categoryParticipants.data ?? []) participantCounts.set(row.category, (participantCounts.get(row.category) ?? 0) + 1)
        for (const row of categoryAttendance.data ?? []) {
          const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants
          if (participant?.category) attendanceCounts.set(participant.category, (attendanceCounts.get(participant.category) ?? 0) + 1)
        }
        setDashboardMetrics({
          totalParticipants: total.count ?? 0,
          checkedIn: checkedIn.count ?? 0,
          categoryStats: categories.map((category) => ({ id: category.id, name: category.name, total: participantCounts.get(category.id) ?? 0, checkedIn: attendanceCounts.get(category.id) ?? 0 })),
          recentActivity: [...checkInActivity, ...winnerActivity]
            .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
            .slice(0, 6),
        })
      }
      setDashboardLoading(false)
    }
    void loadDashboardMetrics()
    // Do not refetch dashboard data just because the browser tab becomes visible.
    return () => { cancelled = true }
  }, [activePage, currentRole, dashboardReload])

  useEffect(() => {
    async function loadCurrentAdmin() {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser()

        if (userError) throw userError

        const user = userData.user

        if (!user) {
          throw new Error('No authenticated user was found.')
        }

        setCurrentEmail(user.email ?? '')

        const { data: roleData, error: roleQueryError } = await supabase
          .from('admin_roles')
          .select('role, is_active')
          .eq('user_id', user.id)
          .maybeSingle()

        if (roleQueryError) throw roleQueryError

        if (!roleData || !roleData.is_active) {
          throw new Error(
            'Your administrator account is inactive or has no assigned role. Please contact your Super Admin.',
          )
        }

        if (!rolePageAccess[roleData.role]) {
          throw new Error(
            'Your account has an unrecognised administrator role. Please contact your Super Admin.',
          )
        }

        setCurrentRole(roleData.role)
      } catch (error) {
        console.error('Unable to load administrator role:', error)
        setRoleError(
          error instanceof Error
            ? error.message
            : 'Unable to verify your administrator permissions.',
        )
      } finally {
        setRoleLoading(false)
      }
    }

    void loadCurrentAdmin()
  }, [])

  const allowedPages = rolePageAccess[currentRole] ?? []
  const displayRole = roleLabels[currentRole] ?? 'Administrator'
  const isSuperAdmin = currentRole === 'super_admin'
  const isEventAdmin = currentRole === 'event_admin'
  const canManageParticipants = isSuperAdmin || isEventAdmin
  const isOverview = activePage === 'Overview'
  const isDisplayOutput = window.location.hash.startsWith('#/display')
  const attendancePercent = dashboardMetrics?.totalParticipants
    ? Math.round((dashboardMetrics.checkedIn / dashboardMetrics.totalParticipants) * 100)
    : 0
  const stats = [
    { label: 'Total Participants', value: dashboardLoading ? '…' : dashboardMetrics ? String(dashboardMetrics.totalParticipants) : '—', note: 'Active registrations', icon: Users, color: 'blue' },
    { label: 'Checked In', value: dashboardLoading ? '…' : dashboardMetrics ? String(dashboardMetrics.checkedIn) : '—', note: 'Guests at the venue', icon: ClipboardCheck, color: 'green' },
    { label: 'Pending Arrival', value: dashboardLoading ? '…' : dashboardMetrics ? String(Math.max(0, dashboardMetrics.totalParticipants - dashboardMetrics.checkedIn)) : '—', note: 'Not checked in yet', icon: Activity, color: 'orange' },
  ]

  function navigateToPage(page: string) {
    if (!allowedPages.includes(page)) {
      console.warn(`Access denied: ${displayRole} cannot access ${page}.`)
      return
    }

    setActivePage(page)
    setSidebarOpen(false)
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch {
      setSignOutError('Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }

  if (roleLoading) {
    return (
      <div className="app-shell">
        <main className="main-area">
          <div className="page-content">
            <section className="panel placeholder-panel">
              <h2>Verifying administrator access...</h2>
              <p>Please wait while EventFlow checks your account permissions.</p>
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (roleError || !currentRole) {
    return (
      <div className="app-shell">
        <main className="main-area">
          <div className="page-content">
            <section className="panel placeholder-panel">
              <div className="placeholder-icon">
                <Settings size={30} />
              </div>
              <h2>Access verification failed</h2>
              <p>{roleError || 'Your administrator role could not be verified.'}</p>
              <button className="button-primary" onClick={handleSignOut}>
                Sign out
              </button>
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (isDisplayOutput) {
    return canManageParticipants
      ? <Suspense fallback={<main className="led-output-screen"><p>Loading LED display…</p></main>}><LedDisplayOutput /></Suspense>
      : <main className="led-output-screen"><div className="led-output-error">This display is restricted to Event Admins and Super Admins. Sign in with an administrator account on the LED laptop.</div></main>
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">
            <Gift size={23} />
          </div>
          <div>
            <div className="brand-name">MAQNA EVENTFLOW</div>
            <div className="brand-caption">EVENT MANAGEMENT</div>
          </div>
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {['MAIN', 'EVENT', 'MANAGEMENT'].map((group) => {
            const visibleItems = navigation.filter(
              (item) =>
                item.group === group && allowedPages.includes(item.label),
            )

            if (visibleItems.length === 0) return null

            return (
              <div className="nav-group" key={group}>
                <div className="nav-heading">{group}</div>
                {visibleItems.map((item) => {
                  const Icon = item.icon

                  return (
                    <button
                      key={item.label}
                      className={`nav-item ${activePage === item.label ? 'active' : ''}`}
                      onClick={() => navigateToPage(item.label)}
                    >
                      <Icon size={19} strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={19} />
            </div>
            <strong>Need some help?</strong>
            <p>Check the event management guide.</p>
            {isSuperAdmin && (
              <button onClick={() => navigateToPage('Settings')}>
                View guide <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <div className="admin-profile">
            <div className="profile-avatar">AD</div>
            <div className="profile-info">
              <strong>{displayRole}</strong>
              <span>{currentEmail || displayRole}</span>
            </div>
            <button
              type="button"
              className="profile-sign-out"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              aria-label={signingOut ? 'Signing out' : 'Sign out'}
              title="Sign out"
            >
              <LogOut size={15} />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
          {signOutError && <p className="sign-out-error" role="alert">{signOutError}</p>}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span>Event Management</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="system-status">
              <span className="status-dot" />
              System operational
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <h1>{activePage}</h1>
              <p>{activePage === 'Participants' ? `Manage ${eventName} participants and their registration details.` : pageDescription[activePage]}</p>
            </div>


          </section>

          <Suspense fallback={<section className="panel placeholder-panel"><h2>Loading section…</h2><p>Preparing this part of EventFlow.</p></section>}>
          <div style={{ display: activePage === 'Lucky Draw' && canManageParticipants ? 'block' : 'none' }}>
            <LuckyDrawManagement />
          </div>
          {isOverview ? (
            <>
              <section className="welcome-banner">
                <div className="welcome-content">
                  <div className="welcome-project-name">{eventName}</div>
                  {(eventDate || eventLocation) && <div className="welcome-event-details">{[eventDate, eventLocation].filter(Boolean).join(' · ')}</div>}
                  <div className="welcome-label">
                    <span className="welcome-spark">✦</span>
                    YOUR EVENT CONTROL CENTRE
                  </div>
                  <h2>Welcome back, {displayRole}.</h2>
                  <p>Live event progress and controls in one place.</p>
                </div>
                <div className="welcome-local-clock" aria-label="Local time in Kuala Lumpur">
                  <span><Clock3 size={13} /> LOCAL TIME · MYT</span>
                  <strong>{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(localTime)}</strong>
                  <small>{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(localTime)}</small>
                </div>
              </section>

              <section className="stats-grid">
                {stats.map((stat) => {
                  const Icon = stat.icon
                  return (
                    <article className="stat-card" key={stat.label}>
                      <div className="stat-top">
                        <div className={`stat-icon ${stat.color}`}>
                          <Icon size={20} />
                        </div>
                        <span className="more-button" aria-hidden="true">
                          <MoreHorizontal size={19} />
                        </span>
                      </div>
                      <div className="stat-label">{stat.label}</div>
                      <div className="stat-value">{stat.value}</div>
                      <div className="stat-footer">
                        <span className="stat-change">Live</span>
                        <span>{stat.note}</span>
                      </div>
                    </article>
                  )
                })}
              </section>

              {dashboardError && <div className="dashboard-data-error" role="alert">Dashboard data could not be loaded: {dashboardError}</div>}

              <section className="dashboard-grid">
                <article className="panel attendance-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Attendance Overview</h3>
                      <p>Live check-in summary</p>
                    </div>
                    <button className="panel-link" onClick={() => navigateToPage('Attendance')}>
                      View details <ArrowUpRight size={15} />
                    </button>
                  </div>

                  <div className="attendance-summary">
                    <div className="attendance-number">
                      <strong>{dashboardMetrics?.checkedIn ?? '—'}</strong>
                      <span>Participants checked in</span>
                    </div>
                    <div className="attendance-percentage">{dashboardMetrics ? `${attendancePercent}%` : '—'}</div>
                  </div>

                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${attendancePercent}%` }} />
                  </div>

                  <div className="attendance-legend">
                    <div><span className="legend-dot checked" /> Checked in <strong>{dashboardMetrics?.checkedIn ?? '—'}</strong></div>
                    <div><span className="legend-dot pending" /> Pending <strong>{dashboardMetrics ? Math.max(0, dashboardMetrics.totalParticipants - dashboardMetrics.checkedIn) : '—'}</strong></div>
                  </div>

                  <div className="attendance-divider" />

                  <div className="category-stats">
                    {(dashboardMetrics?.categoryStats ?? DEFAULT_PARTICIPANT_CATEGORIES.map((category) => ({ ...category, total: 0, checkedIn: 0 }))).map((category, index) => <div className="category-stat" key={category.id}>
                      <div className={`category-icon ${index % 2 === 0 ? 'student' : 'staff'}`}>{index % 2 === 0 ? <Users size={17} /> : <ClipboardCheck size={17} />}</div>
                      <div><strong>{dashboardMetrics ? `${category.checkedIn} / ${category.total}` : '—'}</strong><span>{category.name} checked in</span></div>
                    </div>)}
                  </div>
                </article>

                <article className="panel activity-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Recent Activity</h3>
                      <p>Latest check-ins and confirmed draw winners</p>
                    </div>
                    <button className="panel-link" onClick={() => setDashboardReload((value) => value + 1)} disabled={dashboardLoading}>
                      {dashboardLoading ? 'Refreshing…' : 'Refresh'} <MoreHorizontal size={17} />
                    </button>
                  </div>

                  <div className="activity-list">
                    {dashboardMetrics?.recentActivity.length ? dashboardMetrics.recentActivity.map((activity) => {
                      return <div className={`activity-item ${activity.type === 'winner' ? 'is-winner' : ''}`} key={activity.id}>
                        <div className="activity-avatar">
                          {activity.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </div>
                        <div className="activity-details">
                          <strong>{activity.type === 'winner' ? `Winner: ${activity.full_name}` : activity.full_name}</strong>
                          <span>{activity.type === 'winner' ? `${activity.detail} · ${timeAgo(activity.occurred_at)}` : `${dashboardMetrics?.categoryStats.find((category) => category.id === activity.category)?.name ?? activity.category} checked in · ${timeAgo(activity.occurred_at)}`}</span>
                        </div>
                        <div className={`activity-check ${activity.type === 'winner' ? 'is-winner' : ''}`}>
                          {activity.type === 'winner' ? <Gift size={16} /> : <CheckCircle2 size={16} />}
                        </div>
                      </div>
                    }) : <p className="dashboard-activity-empty">{dashboardLoading ? 'Loading recent activity…' : dashboardMetrics ? 'No check-ins or confirmed winners yet.' : 'Recent activity is unavailable.'}</p>}
                  </div>

                  <button className="activity-footer" onClick={() => navigateToPage('Attendance')}>
                    View attendance <ArrowUpRight size={15} />
                  </button>
                </article>
              </section>

              <section className="bottom-grid">
                <article className="panel quick-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Quick Actions</h3>
                      <p>Common event management tasks</p>
                    </div>
                  </div>
                  <div className="quick-actions">
                    <button onClick={() => navigateToPage('Participants')}>
                      <div className="quick-icon blue"><Users size={20} /></div>
                      <span><strong>Participants</strong><small>Manage guest list</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                    <button onClick={() => navigateToPage('Attendance')}>
                      <div className="quick-icon green"><ClipboardCheck size={20} /></div>
                      <span><strong>Manual Check-in</strong><small>Search for a participant and record arrival</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                    {canManageParticipants && (
                      <>
                        <button onClick={() => navigateToPage('Lucky Draw')}>
                          <div className="quick-icon purple"><Gift size={20} /></div>
                          <span><strong>Lucky Draw</strong><small>Draw from checked-in guests</small></span>
                          <ArrowUpRight size={16} />
                        </button>
                        <button onClick={() => navigateToPage('LED Display')}>
                          <div className="quick-icon orange"><Monitor size={20} /></div>
                          <span><strong>LED Display</strong><small>Control event screen</small></span>
                          <ArrowUpRight size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </article>

                <article className="panel system-panel">
                  <div className="panel-header">
                    <div>
                      <h3>System Status</h3>
                      <p>Application service overview</p>
                    </div>
                    <Activity size={19} className="system-heading-icon" />
                  </div>
                  <div className="system-row">
                    <div><span className="status-dot" /> Application</div>
                    <strong className="system-online">Operational</strong>
                  </div>
                  <div className="system-row">
                    <div><span className="status-dot" /> Database</div>
                    <strong className={dashboardMetrics ? 'system-online' : dashboardLoading ? 'system-pending' : 'system-offline'}>{dashboardMetrics ? 'Connected' : dashboardLoading ? 'Checking' : 'Unavailable'}</strong>
                  </div>
                  <div className="system-row">
                    <div><span className="status-dot" /> LED Output</div>
                    <strong className="system-pending">Open on display laptop</strong>
                  </div>
                  <div className="system-note">
                    <Activity size={15} />
                    Check database status here. Open the LED output link on the venue screen computer.
                  </div>
                </article>
              </section>

              <HiveMindPanel currentRole={currentRole} />
            </>
          ) : activePage === 'Participants' ? (
            <ParticipantManagement
              currentRole={currentRole as 'super_admin' | 'event_admin' | 'front_desk'}
              eventName={eventName}
            />
          ) : activePage === 'Attendance' ? (
            <AttendanceManagement />
          ) : activePage === 'Lucky Draw' && canManageParticipants ? (
            null
          ) : activePage === 'LED Display' && canManageParticipants ? (
            <LedDisplayControl />
          ) : activePage === 'Settings' && (isSuperAdmin || isEventAdmin) ? (
            <EventSettings />
          ) : activePage === 'Development Log' && isSuperAdmin ? (
            <DevelopmentLog />
          ) : activePage === 'Admin Management' && (isSuperAdmin || isEventAdmin) ? (
            <AdminManagement currentRole={currentRole as 'super_admin' | 'event_admin'} />
          ) : (
            <section className="panel placeholder-panel">
              <div className="placeholder-icon">
                {(() => {
                  const item = navigation.find((entry) => entry.label === activePage)
                  const Icon = item?.icon ?? Settings
                  return <Icon size={30} />
                })()}
              </div>
              <h2>{activePage}</h2>
              <p>
                This module is part of the application structure.
                We'll build its features in the upcoming development steps.
              </p>
              <button className="button-secondary" onClick={() => navigateToPage('Overview')}>
                Return to overview
              </button>
            </section>
          )}
          </Suspense>

          <footer className="page-footer">
            <span>MAQNA EVENTFLOW · {eventName}</span>
            <span>EventFlow · Version {__APP_VERSION__}</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App




