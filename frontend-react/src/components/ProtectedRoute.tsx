import { Navigate, Outlet, useLocation } from 'react-router-dom'

const ProtectedRoute = () => {
  const token = localStorage.getItem('nutria_token')
  const location = useLocation()

  if (!token) {
    // IMPORTANT : On combine le pathname ("/") ET le search ("?ticket_id=123")
    // pour ne absolument rien perdre de l'URL d'origine de LabWare
    const fullUrl = `${location.pathname}${location.search}`
    
    return <Navigate to="/login" replace state={{ from: fullUrl }} />
  }

  return <Outlet />
}

export default ProtectedRoute