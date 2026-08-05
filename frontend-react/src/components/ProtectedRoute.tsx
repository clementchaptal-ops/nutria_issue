import { Navigate, Outlet, useLocation } from 'react-router-dom'

/** Route guard that redirects unauthenticated users to the login page. */
const ProtectedRoute = () => {
  const token = localStorage.getItem('nutria_token')
  const location = useLocation()

  if (!token) {
    const fullUrl = `${location.pathname}${location.search}`
    
    return <Navigate to="/login" replace state={{ from: fullUrl }} />
  }

  return <Outlet />
}

export default ProtectedRoute