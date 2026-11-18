
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './components/AuthGate'
import { AppPage, GuestPassPage } from './lazyEntrypoints'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif' }}>Loading EventFlow…</main>}>
    {window.location.pathname.endsWith('/guest-pass') || window.location.hash.startsWith('#/guest-pass') ? (
      <GuestPassPage />
    ) : (
      <AuthGate>
        <AppPage />
      </AuthGate>
    )}
    </Suspense>
  </StrictMode>,
)
