import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast' // ✅ IMPORT DE TOAST
import styles from './Login.module.css'

interface LimsProfile {
  user_name: string
  full_name: string
  location: string
}

function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation() 

  const [profiles, setProfiles] = useState<LimsProfile[]>([])
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [requireSelection, setRequireSelection] = useState<boolean>(false)

  const GOOGLE_CLIENT_ID = "549394697229-tvgof9to9fcu4um4260vnigbtt57o9fo.apps.googleusercontent.com"
  const from = location.state?.from || '/dashboard'

  // --- ANALYSE DE L'URL LABWARE ---
  let searchString = from.includes('?') ? from.substring(from.indexOf('?')) : ''
  if (!searchString && location.search) {
    searchString = location.search
  }
  const searchParams = new URLSearchParams(searchString)
  const preselectedProfile = searchParams.get('user_name') || undefined

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
      
      // ✅ Petit message de bienvenue optionnel (tu peux l'enlever si tu veux que ce soit transparent)
      toast.success(t('login.success', `Bienvenue ${data.full_name || data.user_name} !`))
      
      navigate(from, { replace: true })
      
    } catch (err: any) {
      if (selectedProfile) {
        loginToServer(token, undefined)
      } else {
        // ✅ ON UTILISE TOAST ICI AU LIEU DE SETAUTHERROR
        toast.error(err.message || t('login.error.server_fail', 'Unable to connect to the Nutria server.'))
      }
    }
  }

  // --- LE COEUR DE LA SOLUTION : RÉCUPÉRATION DU JETON SANS POP-UP ---
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('id_token=')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const idToken = params.get('id_token');
      
      if (idToken) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        loginToServer(idToken, preselectedProfile);
      }
    }
  }, []);

  // --- REDIRECTION VERS GOOGLE ---
  const handleGoogleRedirect = () => {
    const REDIRECT_URI = window.location.origin + window.location.pathname;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=id_token&scope=email profile openid&nonce=nutria123&prompt=select_account`;
    window.location.href = authUrl;
  }

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
          
          {/* ❌ L'ANCIEN <ErrorMessage message={authError} /> A ÉTÉ SUPPRIMÉ ! */}

          {requireSelection ? (
            <div className={styles.profileSelectionContainer}>
              <h3 className={styles.selectionTitle}>
                {t('login.choose_profile', 'Multiple LIMS profiles detected.')}
              </h3>
              <div className={styles.profileList}>
                {profiles.map((prof) => (
                  <button key={prof.user_name} onClick={() => handleProfileSelect(prof.user_name)} className={styles.profileButton}>
                    <span className={styles.profileIcon}>👤</span>
                    <div className={styles.profileInfo}>
                      <span className={styles.profileName}>{prof.user_name}</span>
                      <span className={styles.profileLocation}>{prof.location}</span>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setRequireSelection(false)} className={styles.backButton}>← {t('login.back', 'Back')}</button>
            </div>
          ) : (
            <>
              <p className={styles.instructions}>
                {t('login.instructions', 'Please log in with your Mérieux NutriSciences account.')}
              </p>
              <div className={styles.buttonWrapper}>
                <button 
                  onClick={handleGoogleRedirect}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                    width: '100%', padding: '10px 24px', backgroundColor: '#ffffff', color: '#3c4043',
                    border: '1px solid #dadce0', borderRadius: '24px', fontSize: '14px', fontWeight: '500',
                    fontFamily: '"Google Sans", Roboto, Arial, sans-serif', cursor: 'pointer',
                    transition: 'background-color 0.2s', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
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

export default Login