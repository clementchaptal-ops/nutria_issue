import { Navigate, Outlet, useLocation } from 'react-router-dom'

/**
 * ProtectedRoute serves as a route guard to restrict access to authenticated users.
 * It checks localStorage for a session token. If the token is absent, the user is
 * redirected to the login page, with their current destination stored in the history 
 * state so they can be redirected back after successfully logging in.
 *
 * @returns {JSX.Element} The child routes (via Outlet) if authenticated, or a Navigate redirect if not.
 */
const ProtectedRoute = () => {
  // Retrieve the authentication token from local storage
  const token = localStorage.getItem('nutria_token')
  
  // Capture the current location to preserve the user's intended destination
  const location = useLocation()

  if (!token) {
    // Reconstruct the full path including any active query parameters
    const fullUrl = `${location.pathname}${location.search}`
    
    // FIX: Save target URL to persistent storage for Google SSO return
    localStorage.setItem('nutria_redirect_target', fullUrl)
    
    // Redirect unauthorized users to login, replacing the history entry
    return <Navigate to="/login" replace state={{ from: fullUrl }} />
  }

  // Render the matching child route components if the user is authenticated
  return <Outlet />
}

export default ProtectedRoute