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
import { Toaster } from 'react-hot-toast' 

/**
 * Root component of the application.
 * Configures the global React Router structure, authentication guards (Protected and Admin routes),
 * global toast notification configurations, and nested application layouts.
 *
 * @returns {JSX.Element} The core application routing tree.
 */
function App() {
  return (
    <BrowserRouter>
      {/* Global toast notification manager */}
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        {/* Public authentication route */}
        <Route path="/login" element={<Login />} />

        {/* Auth-guarded routes requiring a valid session */}
        <Route element={<ProtectedRoute />}>
          {/* Base layout shared across authenticated pages */}
          <Route path="/" element={<MainLayout />}>
            {/* Primary default view */}
            <Route index element={<IssueForm />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* High-privilege routes restricted to administrators */}
            <Route element={<AdminRoute />}>
               <Route path="audit" element={<AuditLogs />} />
               <Route path="regroupements" element={<RegroupementList />} />
               <Route path="regroupements/new" element={<RegroupementForm />} />
               <Route path="regroupements/:id" element={<RegroupementDetail />} />
            </Route>

            {/* Catch-all redirection to root for non-existent authenticated paths */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App