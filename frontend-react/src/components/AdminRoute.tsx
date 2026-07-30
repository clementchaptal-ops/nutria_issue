import { Navigate, Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'

const AdminRoute = () => {
  const userStr = localStorage.getItem('nutria_user')
  const user = userStr ? JSON.parse(userStr) : null

  if (!user || (user.role !== 'IT_TEAM' && user.role !== 'LOCAL_ADMIN')) {
    toast.error("Accès refusé : Module réservé aux administrateurs.")
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default AdminRoute