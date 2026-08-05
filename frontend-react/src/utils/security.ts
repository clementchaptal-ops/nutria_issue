/** Safely opens a validated URL in a new tab using an allowed list of protocols. */
export const openSafeUrl = (url: string | null | undefined) => {
    if (!url) return;
  
    try {
      const parsedUrl = new URL(url, window.location.origin);
      
      if (['http:', 'https:', 'blob:'].includes(parsedUrl.protocol)) {
        window.open(parsedUrl.href, '_blank', 'noopener,noreferrer');
      } else {
        console.error("[Sécurité] Tentative d'ouverture d'une URL non sécurisée bloquée :", url);
      }
    } catch (error) {
      console.error("[Sécurité] Format d'URL invalide :", url);
    }
  };