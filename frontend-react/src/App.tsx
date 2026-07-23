import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import TicketForm from './pages/TicketForm'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute' 
import AuditLogs from './pages/AuditLogs'
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        
        {/* Public route for login (without menu or global layout) */}
        <Route path="/login" element={<Login />} />

        {/* SECURITY WALL: EVERYTHING BELOW IS PROTECTED */}
        <Route element={<ProtectedRoute />}>
          
          {/* Main interface (MainLayout) wraps our protected pages */}
          <Route path="/" element={<MainLayout />}>
            
            {/* Inner application pages */}
            <Route index element={<TicketForm />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* Audit logs route */}
            <Route path="audit" element={<AuditLogs />} />
            
            {/* Fallback redirection: if the URL doesn't exist, redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
            
          </Route>
          
        </Route>

      </Routes>
    </BrowserRouter>
  )
}

export default App