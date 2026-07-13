import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
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

function LoginContent() {
  const { t } = useTranslation() // i18n hook
  const navigate = useNavigate()
  const location = useLocation() 
  const [authError, setAuthError] = useState<string | null>(null)

  // États pour la gestion des profils multiples
  const [profiles, setProfiles] = useState<LimsProfile[]>([])
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [requireSelection, setRequireSelection] = useState<boolean>(false)

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
      const response = await fetch('https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api/auth', {
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

  // --- NOUVELLE CONNEXION GOOGLE SANS IFRAME ---
  const loginWithGoogle = useGoogleLogin({
    onSuccess: (credentialResponse) => {
      setAuthError(null)
      if (credentialResponse.access_token) {
        loginToServer(credentialResponse.access_token, preselectedProfile)
      }
    },
    onError: () => setAuthError(t('login.error.google_fail', 'Google authentication failed.')),
  })

  const handleProfileSelect = (profileName: string) => {
    if (googleToken) {
      loginToServer(googleToken, profileName)
    }
  }
    
  return (
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
                {/* --- NOUVEAU BOUTON PERSONNALISÉ --- */}
                <button 
                  onClick={() => loginWithGoogle()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 24px',
                    backgroundColor: '#ffffff',
                    color: '#3c4043',
                    border: '1px solid #dadce0',
                    borderRadius: '24px',
                    fontSize: '14px',
                    fontWeight: '500',
                    fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                  {t('login.signin_with', 'Sign in with Google')}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// Composant principal qui enveloppe tout avec le Provider
function Login() {
  const GOOGLE_CLIENT_ID = "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com"
  
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <LoginContent />
    </GoogleOAuthProvider>
  )
}

export default Login