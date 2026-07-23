const MAPKIT_SCRIPT_ID = 'apple-mapkit-js';
const MAPKIT_SCRIPT_SRC = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';

export interface MapKitLoadOptions {
  /** A static MapKit JS authorization token (JWT). */
  token?: string;
  /** A callback that supplies (and can refresh) the authorization token. Takes
   * precedence over {@link token} when both are provided. */
  authorizationCallback?: (done: (token: string) => void) => void;
  language?: string;
  libraries?: readonly string[];
}

let loadPromise: Promise<typeof mapkit> | null = null;

/**
 * Loads Apple MapKit JS from Apple's CDN (once) and initializes it with the
 * provided authorization. Mirrors the external-SDK loader other web providers
 * use (Google Maps' `LibraryLoader`, ArcGIS' `@arcgis/core`).
 */
export function loadMapKit(options: MapKitLoadOptions): Promise<typeof mapkit> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<typeof mapkit>((resolve, reject) => {
    const initialize = () => {
      try {
        const authorizationCallback =
          options.authorizationCallback ?? ((done: (token: string) => void) => done(options.token ?? ''));
        mapkit.init({
          authorizationCallback,
          ...(options.language ? { language: options.language } : {}),
          ...(options.libraries ? { libraries: [...options.libraries] } : {}),
        });
        resolve(mapkit);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    if (typeof mapkit !== 'undefined' && typeof mapkit.init === 'function') {
      initialize();
      return;
    }

    if (typeof document === 'undefined') {
      reject(new Error('MapKit JS can only be loaded in a browser environment.'));
      return;
    }

    const existing = document.getElementById(MAPKIT_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', initialize);
      existing.addEventListener('error', () => reject(new Error('Failed to load MapKit JS.')));
      return;
    }

    const script = document.createElement('script');
    script.id = MAPKIT_SCRIPT_ID;
    script.src = MAPKIT_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', initialize);
    script.addEventListener('error', () => reject(new Error('Failed to load MapKit JS.')));
    document.head.appendChild(script);
  });

  return loadPromise;
}
