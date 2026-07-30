import { useEffect } from 'react'
import axios from 'axios'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import IssueForm from './pages/IssueForm' 
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute' 
import AuditLogs from './pages/AuditLogs'
import RegroupementList from './pages/RegroupementList'
import RegroupementForm from './pages/RegroupementForm'
import RegroupementDetail from './pages/RegroupementDetail'
import { Toaster, toast } from 'react-hot-toast' // Ajout de toast ici

function App() {
  
  // 🚨 INTERCEPTEUR GLOBAL POUR DÉCONNEXION AUTOMATIQUE (401)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          // On vide le stockage local
          localStorage.removeItem('nutria_token')
          localStorage.removeItem('nutria_user')
          
          // Petit message pour prévenir l'utilisateur
          toast.error("Votre session a expiré, veuillez vous reconnecter.", { id: 'session-expired' })
          
          // Redirection forcée vers la page de login
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }
    )

    return () => axios.interceptors.response.eject(interceptor)
  }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        
        {/* Public route for login */}
        <Route path="/login" element={<Login />} />

        {/* SECURITY WALL: EVERYTHING BELOW IS PROTECTED */}
        <Route element={<ProtectedRoute />}>
          
          {/* Main layout wrapper */}
          <Route path="/" element={<MainLayout />}>
            
            {/* Inner application pages */}
            <Route index element={<IssueForm />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* Audit logs route */}
            <Route path="audit" element={<AuditLogs />} />
            
            {/* Regroupements routes */}
            <Route path="regroupements" element={<RegroupementList />} />
            <Route path="regroupements/new" element={<RegroupementForm />} />
            <Route path="regroupements/:id" element={<RegroupementDetail />} />

            {/* Fallback redirection (placé à la toute fin) */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Route>
          
        </Route>

      </Routes>
    </BrowserRouter>
  )
}

export default App