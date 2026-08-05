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
 * Root component that manages the application routing layout, authentication guards, and global toast notifications.
 */
function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<IssueForm />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            <Route element={<AdminRoute />}>
               <Route path="audit" element={<AuditLogs />} />
               <Route path="regroupements" element={<RegroupementList />} />
               <Route path="regroupements/new" element={<RegroupementForm />} />
               <Route path="regroupements/:id" element={<RegroupementDetail />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App