import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppStore } from './store/useAppStore'
import { db } from './db/database'

if (typeof window !== 'undefined') {
  (window as any).__STORE__ = useAppStore;
  (window as any).__DB__ = db;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
