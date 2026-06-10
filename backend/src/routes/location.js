// Location routes: Google Places autocomplete/details proxy
// (with Nominatim/OpenStreetMap fallback for autocomplete).

export function registerLocationRoutes(app) {
  // ---------------------------
  // PROTECTED: Guest list (requires auth, verifies ownership)
  // ---------------------------
  // ---------------------------
  // Location Autocomplete Endpoint
  // Uses Google Places API if available, falls back to Nominatim (free)
  // Supports optional lat/lng for location-biased results.
  // ---------------------------
  app.get("/api/location/autocomplete", async (req, res) => {
    try {
      const { query, lat, lng } = req.query;

      if (!query || query.length < 2) {
        return res.json({ predictions: [] });
      }

      const GOOGLE_PLACES_API_KEY =
        process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

      // Try Google Places API first if API key is available
      if (GOOGLE_PLACES_API_KEY) {
        try {
          let googleUrl =
            `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
            `input=${encodeURIComponent(query)}&` +
            `key=${GOOGLE_PLACES_API_KEY}&` +
            `types=establishment|geocode&` +
            `components=country:us|country:se`;

          // If we have user coordinates, bias results near them
          if (lat && lng) {
            const latNum = Number(lat);
            const lngNum = Number(lng);
            if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
              googleUrl += `&locationbias=point:${latNum},${lngNum}`;
            }
          }

          const response = await fetch(googleUrl);

          if (response.ok) {
            const data = await response.json();
            if (data.status === "OK" && data.predictions) {
              return res.json({
                predictions: data.predictions.map((pred) => ({
                  place_id: pred.place_id,
                  description: pred.description,
                  main_text:
                    pred.structured_formatting?.main_text || pred.description,
                  secondary_text:
                    pred.structured_formatting?.secondary_text || "",
                  source: "google",
                })),
              });
            }
          }
        } catch (error) {
          console.error("Google Places API error:", error);
          // Fall through to Nominatim
        }
      }

      // Fallback to Nominatim (OpenStreetMap) - free, no API key needed
      let nominatimUrl =
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `q=${encodeURIComponent(query)}&` +
        `limit=5&` +
        `addressdetails=1&` +
        `extratags=1`;

      // If we have user coordinates, try to bias Nominatim around them using a bounding box
      if (lat && lng) {
        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
          const delta = 0.5; // ~50km; rough bounding box
          const left = lngNum - delta;
          const right = lngNum + delta;
          const top = latNum + delta;
          const bottom = latNum - delta;
          nominatimUrl += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
        }
      }

      const nominatimResponse = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "PullUp App",
        },
      });

      if (nominatimResponse.ok) {
        const data = await nominatimResponse.json();
        return res.json({
          predictions: data.map((item) => ({
            place_id: item.place_id,
            description: item.display_name,
            main_text:
              item.name || item.display_name?.split(",")[0] || "Location",
            secondary_text:
              item.display_name?.split(",").slice(1, 3).join(", ").trim() || "",
            lat: item.lat,
            lon: item.lon,
            source: "nominatim",
          })),
        });
      }

      return res.json({ predictions: [] });
    } catch (error) {
      console.error("Location autocomplete error:", error);
      res.status(500).json({ error: "Failed to fetch location suggestions" });
    }
  });

  // ---------------------------
  // Get Place Details (for coordinates)
  // ---------------------------
  app.get("/api/location/details", async (req, res) => {
    try {
      const { place_id, source } = req.query;

      if (!place_id) {
        return res.status(400).json({ error: "place_id is required" });
      }

      const GOOGLE_PLACES_API_KEY =
        process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

      if (source === "google" && GOOGLE_PLACES_API_KEY) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?` +
              `place_id=${encodeURIComponent(place_id)}&` +
              `key=${GOOGLE_PLACES_API_KEY}&` +
              `fields=geometry,formatted_address,name`
          );

          if (response.ok) {
            const data = await response.json();
            if (data.status === "OK" && data.result) {
              const result = data.result;
              return res.json({
                address: result.formatted_address || result.name,
                lat: result.geometry?.location?.lat,
                lng: result.geometry?.location?.lng,
              });
            }
          }
        } catch (error) {
          console.error("Google Places Details API error:", error);
        }
      }

      // For Nominatim, we already have lat/lon from autocomplete
      // But we can fetch details if needed
      return res.status(404).json({ error: "Place details not found" });
    } catch (error) {
      console.error("Location details error:", error);
      res.status(500).json({ error: "Failed to fetch location details" });
    }
  });
}
