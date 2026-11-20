
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './components/AuthGate'
import { AppPage } from './lazyEntrypoints'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif' }}>Loading EventFlow…</main>}>
    <AuthGate>
        <AppPage />
      </AuthGate>
    </Suspense>
  </StrictMode>,
)
