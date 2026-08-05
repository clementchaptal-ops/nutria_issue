/**
 * Safely opens a validated URL in a new browser tab.
 * Validates the input URL against a whitelist of secure protocols (http, https, blob)
 * to prevent security vulnerabilities such as javascript: protocol injection (XSS).
 *
 * @param url - The URL string to validate and open. Can be null or undefined.
 */
export const openSafeUrl = (url: string | null | undefined) => {
    // Early return if no URL is provided
    if (!url) return;
  
    try {
      // Resolve relative URLs against the current window origin safely
      const parsedUrl = new URL(url, window.location.origin);
      
      // Enforce strict protocol checking to block malicious schemes
      if (['http:', 'https:', 'blob:'].includes(parsedUrl.protocol)) {
        window.open(parsedUrl.href, '_blank', 'noopener,noreferrer');
      } else {
        // Log block action if the protocol fails validation checks
        console.error("[Sécurité] Tentative d'ouverture d'une URL non sécurisée bloquée :", url);
      }
    } catch (error) {
      // Handle parsing failure when the string is not a valid URL
      console.error("[Sécurité] Format d'URL invalide :", url);
    }
  };