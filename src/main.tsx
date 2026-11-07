import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { bootstrapIntroAudio } from './audio/bootstrap'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'

bootstrapIntroAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
