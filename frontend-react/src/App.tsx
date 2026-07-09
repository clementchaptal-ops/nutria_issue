import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import TicketForm from './pages/TicketForm'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute' 
import AuditLogs from './pages/AuditLogs'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* Route publique pour la connexion (sans menu ni layout global) */}
        <Route path="/login" element={<Login />} />

        {/* LE MUR DE SÉCURITÉ : TOUT CE QUI EST EN DESSOUS EST PROTÉGÉ */}
        <Route element={<ProtectedRoute />}>
          
          {/* L'interface principale (MainLayout) enveloppe nos pages protégées */}
          <Route path="/" element={<MainLayout />}>
            
            {/* Les pages intérieures de l'application */}
            <Route index element={<TicketForm />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            {/* 🚨 LA NOUVELLE ROUTE AUDIT EST ICI 🚨 */}
            <Route path="audit" element={<AuditLogs />} />
            
            {/* Redirection de secours : si l'URL tapée n'existe pas, on renvoie à l'accueil */}
            <Route path="*" element={<Navigate to="/" replace />} />
            
          </Route>
          
        </Route>

      </Routes>
    </BrowserRouter>
  )
}

export default App