import { useEffect, useRef, useState } from "react";
import { loadGooglePlaces } from "../lib/loadGooglePlaces.js";
import { colors } from "../theme/colors.js";

// A live map with a draggable pin, two-way-synced with the location search.
//   - search picks a place  → parent updates lat/lng → pin moves here
//   - click the map / drag the pin → reverse-geocode → onPick(...) back up
// Uses the same Google Maps script the autocomplete already loads (core Maps +
// places), so there's no extra dependency. Falls back to nothing if the API key
// is missing or the script fails — the search box alone still works.

// Sweden-centric default when we have neither a pin nor a geolocation fix.
const FALLBACK = { lat: 59.3293, lng: 18.0686, zoom: 11 };

export function LocationMap({ lat, lng, onPick, dimmed = false, height = 260 }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [status, setStatus] = useState("loading"); // loading | ready | failed

  const hasPin = lat != null && lng != null;

  // Reverse-geocode a clicked/dragged point, then hand the result back up.
  function emitForPoint(latLng) {
    const ll = { lat: latLng.lat(), lng: latLng.lng() };
    const finish = (address, placeId) =>
      onPickRef.current?.({ address: address || "Pinned location", lat: ll.lat, lng: ll.lng, placeId: placeId || null });
    if (!geocoderRef.current) return finish(null, null);
    geocoderRef.current.geocode({ location: ll }, (results, gStatus) => {
      if (gStatus === "OK" && results?.[0]) finish(results[0].formatted_address, results[0].place_id);
      else finish(null, null);
    });
  }

  function placeMarker(map, position, google) {
    if (markerRef.current) {
      markerRef.current.setPosition(position);
      return;
    }
    const marker = new google.maps.Marker({
      map, position, draggable: true,
      animation: google.maps.Animation.DROP,
    });
    marker.addListener("dragend", (e) => emitForPoint(e.latLng));
    markerRef.current = marker;
  }

  // One-time init.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadGooglePlaces(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
      const google = window.google;
      if (cancelled) return;
      if (!ok || !google?.maps || !divRef.current) { setStatus("failed"); return; }

      const center = hasPin ? { lat, lng } : { lat: FALLBACK.lat, lng: FALLBACK.lng };
      const map = new google.maps.Map(divRef.current, {
        center,
        zoom: hasPin ? 15 : FALLBACK.zoom,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        keyboardShortcuts: false,
        styles: [{ featureType: "poi.business", stylers: [{ visibility: "on" }] }],
      });
      mapRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();

      // Click anywhere → drop / move the pin and sync up.
      map.addListener("click", (e) => {
        placeMarker(map, e.latLng, google);
        emitForPoint(e.latLng);
      });

      if (hasPin) placeMarker(map, center, google);

      // No pin yet → try to center on the host's rough location (bias only,
      // no marker) so the map opens somewhere meaningful.
      if (!hasPin && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || markerRef.current) return;
            map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            map.setZoom(13);
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
        );
      }
      setStatus("ready");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External selection (autocomplete) → move the pin + recenter.
  useEffect(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!map || !google?.maps || !hasPin) return;
    const pos = { lat, lng };
    placeMarker(map, pos, google);
    map.panTo(pos);
    if (map.getZoom() < 14) map.setZoom(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  if (status === "failed") return null;

  return (
    <div style={{ position: "relative", marginTop: 14, opacity: dimmed ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
      <div
        ref={divRef}
        style={{
          width: "100%", height, borderRadius: 14, overflow: "hidden",
          border: `1px solid ${colors.border}`, background: colors.surfaceMuted,
        }}
      />
      {status === "ready" && !hasPin && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.94)", color: colors.textMuted, fontSize: 12, fontWeight: 600,
          padding: "7px 13px", borderRadius: 999, boxShadow: "0 2px 10px rgba(10,10,10,0.12)", pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          Tap the map to drop a pin
        </div>
      )}
    </div>
  );
}
