import { Navigate, Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'
import i18next from 'i18next'

const AdminRoute = () => {
  const userStr = localStorage.getItem('nutria_user')
  const user = userStr ? JSON.parse(userStr) : null

  if (!user || (user.role !== 'IT_TEAM' && user.role !== 'LOCAL_ADMIN')) {
    toast.error(i18next.t('admin.access_denied', "Access denied. You don't have permission to access this page."))
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default AdminRoute