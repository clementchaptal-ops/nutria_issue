import { Navigate, Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'
import i18next from 'i18next'

/**
 * Route guard component that restricts route access to authenticated users
 * who possess either 'IT_TEAM' or 'LOCAL_ADMIN' roles. Unauthorized attempts
 * are redirected to the dashboard page alongside an error toast notification.
 *
 * @returns {JSX.Element} The nested child routes via Outlet if authorized, or a Navigate redirect.
 */
const AdminRoute = () => {
  // Retrieve and parse the authenticated user session from local storage
  const userStr = localStorage.getItem('nutria_user')
  const user = userStr ? JSON.parse(userStr) : null

  // Verify if the user exists and holds an authorized administrator role
  if (!user || (user.role !== 'IT_TEAM' && user.role !== 'LOCAL_ADMIN')) {
    toast.error(i18next.t('admin.access_denied', "Access denied. You don't have permission to access this page."))
    return <Navigate to="/dashboard" replace />
  }

  // Render child routes if authorization requirements are met
  return <Outlet />
}

export default AdminRoute