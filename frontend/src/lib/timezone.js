export async function fetchTimezoneForLocation(lat, lng) {
  if (lat == null || lng == null) return null;
  if (typeof window === "undefined") return null;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("VITE_GOOGLE_MAPS_API_KEY is not set for timezone lookup");
    return null;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const url =
      "https://maps.googleapis.com/maps/api/timezone/json" +
      `?location=${encodeURIComponent(`${lat},${lng}`)}` +
      `&timestamp=${timestamp}` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error("Timezone API request failed", res.status);
      return null;
    }

    const data = await res.json();
    if (data.status === "OK" && data.timeZoneId) {
      return data.timeZoneId;
    }

    console.error("Timezone API error", data.status, data.errorMessage);
    return null;
  } catch (error) {
    console.error("Error fetching timezone for location", error);
    return null;
  }
}

