
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Gift,
  Trophy,
  Bell,
  Monitor,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  CalendarDays,
  Activity,
  ChevronDown,
  Menu,
  X,
  CircleHelp,
  ScanLine,
  Clock3,
  CheckCircle2,
  MoreHorizontal,
} from 'lucide-react'
import './App.css'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, group: 'MAIN' },
  { label: 'Participants', icon: Users, group: 'MAIN' },
  { label: 'Attendance', icon: ClipboardCheck, group: 'MAIN' },
  { label: 'Lucky Draw', icon: Gift, group: 'EVENT' },
  { label: 'Prizes', icon: Trophy, group: 'EVENT' },
  { label: 'Notifications', icon: Bell, group: 'EVENT' },
  { label: 'LED Display', icon: Monitor, group: 'MANAGEMENT' },
  { label: 'Settings', icon: Settings, group: 'MANAGEMENT' },
]

const stats = [
  {
    label: 'Total Participants',
    value: '1,248',
    change: '+12.5%',
    note: 'Compared to last event',
    icon: Users,
    color: 'blue',
  },
  {
    label: 'Checked In',
    value: '864',
    change: '69.2%',
    note: 'Of registered participants',
    icon: ClipboardCheck,
    color: 'green',
  },
  {
    label: 'Pending Arrival',
    value: '384',
    change: '30.8%',
    note: 'Awaiting check-in',
    icon: Clock3,
    color: 'orange',
  },
  {
    label: 'Prizes Available',
    value: '24',
    change: '8 categories',
    note: 'Ready for lucky draw',
    icon: Gift,
    color: 'purple',
  },
]

const recentActivity = [
  { name: 'Ahmad Firdaus', category: 'Staff', time: 'Just now', status: 'Checked in' },
  { name: 'Nur Aisyah', category: 'Student', time: '2 min ago', status: 'Checked in' },
  { name: 'Muhammad Danish', category: 'Staff', time: '4 min ago', status: 'Checked in' },
  { name: 'Siti Hajar', category: 'Student', time: '6 min ago', status: 'Checked in' },
  { name: 'Daniel Wong', category: 'Staff', time: '8 min ago', status: 'Checked in' },
]

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const pageDescription: Record<string, string> = {
    Overview: 'Monitor your event at a glance.',
    Participants: 'Manage your registered guests and their details.',
    Attendance: 'Track arrivals and manage event check-in.',
    'Lucky Draw': 'Manage draw rounds and announce winners.',
    Prizes: 'Organise prizes, sponsors and prize collection.',
    Notifications: 'Manage participant notification subscriptions.',
    'LED Display': 'Control what appears on your event display.',
    Settings: 'Configure your event and administrator access.',
  }

  const isOverview = activePage === 'Overview'

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
            <div className="brand-name">EVENTFLOW</div>
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

        <div className="event-selector">
          <div className="event-avatar">AD</div>
          <div className="event-info">
            <strong>Annual Dinner 2026</strong>
            <span>Current event</span>
          </div>
          <ChevronDown size={16} />
        </div>

        <nav className="sidebar-nav">
          {['MAIN', 'EVENT', 'MANAGEMENT'].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-heading">{group}</div>
              {navigation
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      className={`nav-item ${activePage === item.label ? 'active' : ''}`}
                      onClick={() => {
                        setActivePage(item.label)
                        setSidebarOpen(false)
                      }}
                    >
                      <Icon size={19} strokeWidth={1.8} />
                      <span>{item.label}</span>
                      {item.label === 'Notifications' && (
                        <span className="nav-count">3</span>
                      )}
                    </button>
                  )
                })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={19} /></div>
            <strong>Need some help?</strong>
            <p>Check the event management guide.</p>
            <button onClick={() => setActivePage('Settings')}>
              View guide <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="admin-profile">
            <div className="profile-avatar">AD</div>
            <div className="profile-info">
              <strong>Event Administrator</strong>
              <span>Super Admin</span>
            </div>
            <MoreHorizontal size={19} />
          </div>
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
            <button className="icon-button" aria-label="Search">
              <Search size={19} />
            </button>
            <button className="icon-button notification-button" aria-label="Notifications">
              <Bell size={19} />
              <span />
            </button>
            <div className="topbar-user">
              <div className="profile-avatar small">AD</div>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">EVENT OVERVIEW</div>
              <h1>{activePage}</h1>
              <p>{pageDescription[activePage]}</p>
            </div>
            <div className="heading-actions">
              <button className="button-secondary">
                <CalendarDays size={17} />
                16 November 2026
                <ChevronDown size={15} />
              </button>
              <button className="button-primary" onClick={() => setActivePage('Participants')}>
                <Plus size={18} />
                Add Participant
              </button>
            </div>
          </section>

          {isOverview ? (
            <>
              <section className="welcome-banner">
                <div className="welcome-content">
                  <div className="welcome-label">
                    <span className="welcome-spark">✦</span>
                    YOUR EVENT CONTROL CENTRE
                  </div>
                  <h2>Good evening, Administrator.</h2>
                  <p>
                    Everything is coming together. Here's what's happening
                    with your annual dinner.
                  </p>
                  <button onClick={() => setActivePage('Attendance')}>
                    View attendance <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="banner-decoration">
                  <div className="banner-circle circle-one" />
                  <div className="banner-circle circle-two" />
                  <div className="banner-symbol"><Gift size={65} /></div>
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
                        <button className="more-button" aria-label={`More about ${stat.label}`}>
                          <MoreHorizontal size={19} />
                        </button>
                      </div>
                      <div className="stat-label">{stat.label}</div>
                      <div className="stat-value">{stat.value}</div>
                      <div className="stat-footer">
                        <span className="stat-change">{stat.change}</span>
                        <span>{stat.note}</span>
                      </div>
                    </article>
                  )
                })}
              </section>

              <section className="dashboard-grid">
                <article className="panel attendance-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Attendance Overview</h3>
                      <p>Live check-in summary</p>
                    </div>
                    <button className="panel-link" onClick={() => setActivePage('Attendance')}>
                      View details <ArrowUpRight size={15} />
                    </button>
                  </div>

                  <div className="attendance-summary">
                    <div className="attendance-number">
                      <strong>864</strong>
                      <span>Participants checked in</span>
                    </div>
                    <div className="attendance-percentage">69.2%</div>
                  </div>

                  <div className="progress-track">
                    <div className="progress-fill" />
                  </div>

                  <div className="attendance-legend">
                    <div><span className="legend-dot checked" /> Checked in <strong>864</strong></div>
                    <div><span className="legend-dot pending" /> Pending <strong>384</strong></div>
                  </div>

                  <div className="attendance-divider" />

                  <div className="category-stats">
                    <div className="category-stat">
                      <div className="category-icon student"><Users size={17} /></div>
                      <div><strong>528</strong><span>Students checked in</span></div>
                    </div>
                    <div className="category-stat">
                      <div className="category-icon staff"><ClipboardCheck size={17} /></div>
                      <div><strong>336</strong><span>Staff checked in</span></div>
                    </div>
                  </div>
                </article>

                <article className="panel activity-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Recent Activity</h3>
                      <p>Latest participant check-ins</p>
                    </div>
                    <button className="more-button" aria-label="More activity options">
                      <MoreHorizontal size={20} />
                    </button>
                  </div>

                  <div className="activity-list">
                    {recentActivity.map((activity, index) => (
                      <div className="activity-item" key={`${activity.name}-${index}`}>
                        <div className="activity-avatar">
                          {activity.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </div>
                        <div className="activity-details">
                          <strong>{activity.name}</strong>
                          <span>{activity.category} · {activity.time}</span>
                        </div>
                        <div className="activity-check">
                          <CheckCircle2 size={16} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="activity-footer" onClick={() => setActivePage('Attendance')}>
                    View all activity <ArrowUpRight size={15} />
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
                    <button onClick={() => setActivePage('Participants')}>
                      <div className="quick-icon blue"><Users size={20} /></div>
                      <span><strong>Participants</strong><small>Manage guest list</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                    <button onClick={() => setActivePage('Attendance')}>
                      <div className="quick-icon green"><ScanLine size={20} /></div>
                      <span><strong>Scan QR Code</strong><small>Open check-in module</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                    <button onClick={() => setActivePage('Lucky Draw')}>
                      <div className="quick-icon purple"><Gift size={20} /></div>
                      <span><strong>Lucky Draw</strong><small>Manage prize draws</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                    <button onClick={() => setActivePage('LED Display')}>
                      <div className="quick-icon orange"><Monitor size={20} /></div>
                      <span><strong>LED Display</strong><small>Control event screen</small></span>
                      <ArrowUpRight size={16} />
                    </button>
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
                    <strong className="system-pending">Not connected</strong>
                  </div>
                  <div className="system-row">
                    <div><span className="status-dot" /> LED Receiver</div>
                    <strong className="system-pending">Not paired</strong>
                  </div>
                  <div className="system-row">
                    <div><span className="status-dot" /> Push Notifications</div>
                    <strong className="system-pending">Not configured</strong>
                  </div>
                  <div className="system-note">
                    <Activity size={15} />
                    Integration setup will be completed in later stages.
                  </div>
                </article>
              </section>
            </>
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
              <button className="button-secondary" onClick={() => setActivePage('Overview')}>
                Return to overview
              </button>
            </section>
          )}

          <footer className="page-footer">
            <span>EVENTFLOW · ANNUAL DINNER MANAGEMENT</span>
            <span>Development preview · Version 0.1.0</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
