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
import { Toaster } from 'react-hot-toast'

function App() {
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