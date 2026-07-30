import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './MainLayout.module.css'

function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation() 
  
  const isLoggedIn = !!localStorage.getItem('nutria_token')

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
      isAdmin = role === 'IT_TEAM' || role === 'LOCAL_ADMIN'
    } catch (e) {
      displayUser = rawUser
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('nutria_token')
    localStorage.removeItem('nutria_user')
    navigate('/login') 
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        
        <div className={styles.logoArea}>
          <span 
            className={styles.logoText} 
            onClick={() => navigate('/dashboard')}
            style={{ cursor: 'pointer' }}
            title={t('layout.go_to_dashboard', 'Go to Dashboard')}
          >
            NUTRIA
          </span>

          {isLoggedIn && location.pathname !== '/dashboard' && (
            <button 
              onClick={() => navigate('/dashboard')}
              className={styles.dashboardBtn}
            >
              🏠 {t('layout.dashboard_btn', 'Dashboard')}
            </button>
          )}

          {/* 🚨 NOUVEAU BOUTON : Accès aux Regroupements */}
          {isLoggedIn && location.pathname !== '/regroupements' && (
            <button 
              onClick={() => navigate('/regroupements')}
              className={styles.dashboardBtn}
              style={{ marginLeft: '10px', borderColor: '#0052cc', color: '#0052cc' }}
            >
              📁 {t('layout.regroupements_btn', 'Regroupements')}
            </button>
          )}

          {isLoggedIn && isAdmin && location.pathname !== '/audit' && (
            <button 
              onClick={() => navigate('/audit')}
              className={styles.dashboardBtn}
              style={{ marginLeft: '10px', borderColor: '#ff991f', color: '#d97008' }}
            >
              🛡️ Audit Logs
            </button>
          )}
        </div>

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
      
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout