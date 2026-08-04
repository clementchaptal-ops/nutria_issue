import { useEffect } from 'react'
import axios from 'axios'
import i18next from 'i18next'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import IssueForm from './pages/IssueForm' 
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import AuditLogs from './pages/AuditLogs'
import ProtectedRoute from './components/ProtectedRoute' 
import AdminRoute from './components/AdminRoute' 
import RegroupementList from './pages/RegroupementList'
import RegroupementForm from './pages/RegroupementForm'
import RegroupementDetail from './pages/RegroupementDetail'
import { Toaster, toast } from 'react-hot-toast' 


axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('nutria_token')
      localStorage.removeItem('nutria_user')
      
      toast.error(
        i18next.t('auth.session_expired', 'Your session has expired, please log in again.'), 
        { id: 'session-expired' }
      )
      
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

function App() {
  // Le useEffect a été supprimé ici car l'intercepteur est géré globalement plus haut !

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
            
            <Route element={<AdminRoute />}>
               <Route path="audit" element={<AuditLogs />} />
               <Route path="regroupements" element={<RegroupementList />} />
               <Route path="regroupements/new" element={<RegroupementForm />} />
               <Route path="regroupements/:id" element={<RegroupementDetail />} />
            </Route>

            {/* Fallback redirection */}
            <Route path="*" element={<Navigate to="/" replace />} />

          </Route>
          
        </Route>

      </Routes>
    </BrowserRouter>
  )
}

export default App