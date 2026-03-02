let loadingPromise = null;

export function loadGooglePlaces(apiKey) {
  if (typeof window === "undefined") return Promise.resolve(false);

  if (window.google?.maps?.places) {
    return Promise.resolve(true);
  }

  if (!apiKey) {
    console.error("VITE_GOOGLE_MAPS_API_KEY is not set");
    return Promise.resolve(false);
  }

  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-role="google-maps-places"]',
    );

    if (existingScript && window.google?.maps?.places) {
      resolve(true);
      return;
    }

    const script = existingScript || document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.role = "google-maps-places";

    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve(true);
      } else {
        console.error("Google Maps Places library failed to load");
        resolve(false);
      }
    };

    script.onerror = (error) => {
      console.error("Error loading Google Maps Places script", error);
      reject(error);
    };

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  return loadingPromise;
}

