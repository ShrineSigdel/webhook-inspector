import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { Header } from './components/Header'
import { Loading } from './components/Loading'
import { ProtectedRoute } from './components/ProtectedRoute'
import { EndpointPage } from './pages/EndpointPage'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { MyEndpoints } from './pages/MyEndpoints'
import { NotFound } from './pages/NotFound'
import { Register } from './pages/Register'

function AppShell() {
  const { restoring } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        {restoring ? (
          <Loading label="Restoring your session…" />
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/endpoints" element={<MyEndpoints />} />
            </Route>
            <Route path="/endpoints/:id" element={<EndpointPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-muted)]">
        Built by{' '}
        <a
          href="https://github.com/ShrineSigdel"
          target="_blank"
          rel="noreferrer"
          className="font-medium"
        >
          Shrine Sigdel
        </a>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
