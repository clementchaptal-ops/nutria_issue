/**
 * Ouvre une URL de manière sécurisée dans un nouvel onglet
 * Prévient les failles XSS en bloquant les protocoles dangereux (ex: javascript:)
 */
export const openSafeUrl = (url: string | null | undefined) => {
    if (!url) return;
  
    try {
      const parsedUrl = new URL(url, window.location.origin);
      
      // Allowlist : on n'autorise que le web classique et les blobs de fichiers locaux
      if (['http:', 'https:', 'blob:'].includes(parsedUrl.protocol)) {
        window.open(parsedUrl.href, '_blank', 'noopener,noreferrer');
      } else {
        console.error("[Sécurité] Tentative d'ouverture d'une URL non sécurisée bloquée :", url);
      }
    } catch (error) {
      console.error("[Sécurité] Format d'URL invalide :", url);
    }
  };