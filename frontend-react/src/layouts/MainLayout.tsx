import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next' // 🚨 Ajout de l'import i18n
import styles from './MainLayout.module.css'

function MainLayout() {
  const { t } = useTranslation() // 🚨 Initialisation du hook
  const navigate = useNavigate()
  const location = useLocation() 
  
  const isLoggedIn = !!localStorage.getItem('nutria_token')

  // 🚨 RECONSTRUCTION PROPRE DU PARSING DE L'UTILISATEUR
  const rawUser = localStorage.getItem('nutria_user')
  let displayUser = t('layout.default_user', 'User') // 🚨 Traduction de la valeur par défaut
  let displayLocation = ''
  let isAdmin = false
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser)
      // On pioche dans "full_name" (Clément CHAPTAL), sinon "user_name" (PL_CHACLE)
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
            title={t('layout.go_to_dashboard', 'Go to Dashboard')} // 🚨 Traduction du tooltip
          >
            NUTRIA
          </span>

          {isLoggedIn && location.pathname !== '/dashboard' && (
            <button 
              onClick={() => navigate('/dashboard')}
              className={styles.dashboardBtn}
            >
              🏠 {t('layout.dashboard_btn', 'Dashboard')} {/* 🚨 Traduction */}
            </button>
          )}
          {/* 🚨 NOUVEAU BOUTON : Uniquement pour les admins */}
          {isLoggedIn && isAdmin && location.pathname !== '/audit' && (
            <button 
              onClick={() => navigate('/audit')}
              className={styles.dashboardBtn}
              style={{ marginLeft: '10px', borderColor: '#ff991f', color: '#d97008' }} // Style légèrement distinct (orange admin)
            >
              🛡️ Audit Logs
            </button>
          )}
        </div>

        {/* 🚨 BLOC DROITE : On regroupe l'utilisateur et la déconnexion */}
        {isLoggedIn && (
          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              👤 <span>{displayUser}</span>
              {displayLocation && (
                <span className={styles.userLocation}>({displayLocation})</span>
              )}
            </div>

            <button onClick={handleLogout} className={styles.logoutBtn}>
              🚪 {t('layout.logout_btn', 'Logout')} {/* 🚨 Traduction */}
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