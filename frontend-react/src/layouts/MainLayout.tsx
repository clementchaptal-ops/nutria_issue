import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './MainLayout.module.css'

/**
 * MainLayout component that serves as the global application shell.
 * It provides the main navigation header, manages user session state visualization,
 * handles user logout, and renders the matched child routes via React Router's Outlet.
 *
 * @component
 */
function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation() 
  
  // Check if a valid session token exists in local storage
  const isLoggedIn = !!localStorage.getItem('nutria_token')

  // Retrieve and parse the authenticated user profile information
  const rawUser = localStorage.getItem('nutria_user')
  let displayUser = t('layout.default_user', 'User')
  let displayLocation = ''
  let isAdmin = false
  
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser)
      displayUser = parsed.full_name || parsed.user_name || t('layout.default_user', 'User')
      displayLocation = parsed.location || ''
      const role = parsed.role || parsed.current_role || 'USER'
      // Identify admin status based on specific system roles
      isAdmin = role === 'IT_TEAM' || role === 'LOCAL_ADMIN'
    } catch (e) {
      displayUser = rawUser
    }
  }

  /**
   * Clears all session-related storage and redirects the user to the login screen.
   */
  const handleLogout = () => {
    localStorage.removeItem('nutria_token')
    localStorage.removeItem('nutria_user')
    navigate('/login') 
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        
        <div className={styles.logoArea}>
          {/* Interactive branding header that redirects to the dashboard */}
          <span 
            className={styles.logoText} 
            onClick={() => navigate('/dashboard')}
            style={{ cursor: 'pointer' }}
            title={t('layout.go_to_dashboard', 'Go to Dashboard')}
          >
            NUTRIA
          </span>

          {/* Conditional rendering of the Dashboard navigation button */}
          {isLoggedIn && location.pathname !== '/dashboard' && (
            <button 
              onClick={() => navigate('/dashboard')}
              className={styles.dashboardBtn}
            >
              🏠 {t('layout.dashboard_btn', 'Dashboard')}
            </button>
          )}

          {/* Conditional rendering of the Regroupements management button for administrators */}
          {isLoggedIn && isAdmin && location.pathname !== '/regroupements' && (
            <button 
              onClick={() => navigate('/regroupements')}
              className={styles.dashboardBtn}
              style={{ marginLeft: '10px', borderColor: '#0052cc', color: '#0052cc' }}
            >
              📁 {t('layout.regroupements_btn', 'Regroupements')}
            </button>
          )}

          {/* Conditional rendering of the Audit Logs button for administrators */}
          {isLoggedIn && isAdmin && location.pathname !== '/audit' && (
            <button 
              onClick={() => navigate('/audit')}
              className={styles.dashboardBtn}
              style={{ marginLeft: '10px', borderColor: '#ff991f', color: '#d97008' }}
            >
              🛡️ {t('layout.audit_logs_btn', 'Audit Logs')}
            </button>
          )}
        </div>

        {/* Display profile details and logout option when the user is logged in */}
        {isLoggedIn && (
          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              👤 <span>{displayUser}</span>
              {displayLocation && (
                <span className={styles.userLocation}>({displayLocation})</span>
              )}
            </div>

            <button onClick={handleLogout} className={styles.logoutBtn}>
              🚪 {t('layout.logout_btn', 'Logout')}
            </button>
          </div>
        )}
      </header>
      
      {/* Container for nested route views */}
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout