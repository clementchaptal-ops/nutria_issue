import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import styles from './Login.module.css'

interface LimsProfile {
  user_name: string
  full_name: string
  location: string
}

function Login() {
  const { t } = useTranslation() // i18n hook
  const navigate = useNavigate()
  const location = useLocation() 
  const [authError, setAuthError] = useState<string | null>(null)

  // États pour la gestion des profils multiples
  const [profiles, setProfiles] = useState<LimsProfile[]>([])
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [requireSelection, setRequireSelection] = useState<boolean>(false)

  const GOOGLE_CLIENT_ID = "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com"
  const from = location.state?.from || '/dashboard'

  // --- ANALYSE DE L'URL LABWARE (BLINDÉE) ---
  let searchString = from.includes('?') ? from.substring(from.indexOf('?')) : ''
  
  if (!searchString && location.search) {
    searchString = location.search
  }
  
  const searchParams = new URLSearchParams(searchString)
  const preselectedProfile = searchParams.get('user_name') || undefined
  // ------------------------------------------

  const loginToServer = async (token: string, selectedProfile?: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          credential: token,
          selected_profile: selectedProfile 
        }) 
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || t('login.error.auth_denied', 'Authentication denied'))
      }

      const data = await response.json()

      if (data.require_selection) {
        setGoogleToken(token)
        setProfiles(data.profiles)
        setRequireSelection(true)
        return
      }

      localStorage.setItem('nutria_token', data.access_token)
      localStorage.setItem('nutria_user', JSON.stringify({
        user_name: data.user_name,
        full_name: data.full_name,
        role: data.role,         
        location: data.location  
      }))
      
      navigate(from, { replace: true })
      
    } catch (err: any) {
      if (selectedProfile) {
        console.warn("Le profil pré-sélectionné a été rejeté par l'API, bascule sur le choix manuel.");
        loginToServer(token, undefined)
      } else {
        setAuthError(err.message || t('login.error.server_fail', 'Unable to connect to the Nutria server.'))
      }
    }
  }

  const handleGoogleSuccess = (credentialResponse: any) => {
    setAuthError(null)
    if (credentialResponse.credential) {
      loginToServer(credentialResponse.credential, preselectedProfile)
    }
  }

  const handleProfileSelect = (profileName: string) => {
    if (googleToken) {
      loginToServer(googleToken, profileName)
    }
  }
    
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div className={styles.logoArea}>
            <span className={styles.logoText}>NUTRIA</span>
          </div>
        </header>

        <main className={styles.mainContent}>
          <div className={styles.loginCard}>
            <div className={styles.cardHeader}>
              <span className={styles.subtitle}>{t('login.subtitle', 'NUTRIA ISSUE REPORT')}</span>
            </div>
            
            <div className={styles.divider}></div>
            
            <ErrorMessage message={authError} />

            {requireSelection ? (
              <div className={styles.profileSelectionContainer}>
                <h3 className={styles.selectionTitle}>
                  {t('login.choose_profile', 'Multiple LIMS profiles detected. Please choose one:')}
                </h3>
                
                <div className={styles.profileList}>
                  {profiles.map((prof) => (
                    <button
                      key={prof.user_name}
                      onClick={() => handleProfileSelect(prof.user_name)}
                      className={styles.profileButton}
                    >
                      <span className={styles.profileIcon}>👤</span>
                      <div className={styles.profileInfo}>
                        <span className={styles.profileName}>{prof.user_name}</span>
                        <span className={styles.profileLocation}>{prof.location}</span>
                      </div>
                    </button>
                  ))}
                </div>
                
                <button 
                  onClick={() => setRequireSelection(false)} 
                  className={styles.backButton}
                >
                  ← {t('login.back', 'Back')}
                </button>
              </div>
            ) : (
              <>
                <p className={styles.instructions}>
                  {t('login.instructions', 'Please log in with your Mérieux NutriSciences account to access the platform.')}
                </p>
                
                <div className={styles.buttonWrapper}>
                  <GoogleLogin 
                    onSuccess={handleGoogleSuccess}
                    onError={() => setAuthError(t('login.error.google_fail', 'Google authentication failed.'))}
                    useOneTap={false}
                    shape="pill"
                    theme="filled_blue"
                    text="signin_with"
                    // @ts-ignore
                    use_fedcm={false}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </GoogleOAuthProvider>
  )
}

export default Login