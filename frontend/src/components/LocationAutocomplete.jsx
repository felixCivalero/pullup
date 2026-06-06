import { useState, useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { loadGooglePlaces } from "../lib/loadGooglePlaces.js";
import { composeLocationLabel } from "../lib/urlUtils";
import { colors } from "../theme/colors.js";

// Enhanced location picker with autocomplete and current location
// Uses backend endpoint which supports Google Places API (with fallback to Nominatim)

export function LocationAutocomplete({
  value,
  onChange,
  onLocationSelect, // Callback with { address, lat, lng }
  onFocus,
  onBlur,
  style,
  placeholder = "Add location",
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasRequestedLocationRef = useRef(false);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);

  async function ensurePlacesLoaded() {
    if (typeof window === "undefined") return false;
    if (autocompleteServiceRef.current && placesServiceRef.current) return true;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    const loaded = await loadGooglePlaces(apiKey);
    if (!loaded || !window.google?.maps?.places) {
      console.error("Google Places library not available");
      return false;
    }

    autocompleteServiceRef.current =
      autocompleteServiceRef.current ||
      new window.google.maps.places.AutocompleteService();

    placesServiceRef.current =
      placesServiceRef.current ||
      new window.google.maps.places.PlacesService(
        document.createElement("div"),
      );

    return true;
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function maybeRequestUserLocationForBias() {
    if (hasRequestedLocationRef.current) return;
    if (!navigator.geolocation) return;

    hasRequestedLocationRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      () => {
        // Silently ignore failures for bias-only location
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  }

  async function fetchSuggestions(query) {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const ok = await ensurePlacesLoaded();
      if (!ok || !autocompleteServiceRef.current) {
        setIsLoading(false);
        return;
      }

      const request = {
        input: query,
        types: ["establishment", "geocode"],
      };

      if (userLocation?.lat && userLocation?.lng) {
        request.locationBias = {
          center: {
            lat: userLocation.lat,
            lng: userLocation.lng,
          },
          radius: 50000, // ~50km
        };
      }

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (predictions, status) => {
          setIsLoading(false);

          if (
            status !==
              window.google.maps.places.PlacesServiceStatus.OK ||
            !predictions
          ) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
          }

          const mapped = predictions.map((pred) => ({
            place_id: pred.place_id,
            description: pred.description,
            main_text:
              pred.structured_formatting?.main_text || pred.description,
            secondary_text:
              pred.structured_formatting?.secondary_text || "",
            source: "google",
          }));

          setSuggestions(mapped);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        },
      );
    } catch (error) {
      console.error("Error fetching location suggestions:", error);
      setIsLoading(false);
      setSuggestions([]);
    }
  }

  function handleInputChange(e) {
    const newValue = e.target.value;
    onChange(e);

    // Try to get user location (once) so we can bias results nearby
    maybeRequestUserLocationForBias();

    // Debounce API calls
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300); // Faster debounce for better UX
  }

  async function handleSelectSuggestion(suggestion) {
    let address = suggestion.description || suggestion.main_text;
    let lat = null;
    let lng = null;
    let placeId = suggestion.place_id || null;

    if (suggestion.source === "google" && suggestion.place_id) {
      const ok = await ensurePlacesLoaded();
      if (ok && placesServiceRef.current) {
        await new Promise((resolve) => {
          placesServiceRef.current.getDetails(
            {
              placeId: suggestion.place_id,
              // Richer fields so we can compose a clean human label and keep the
              // precise data behind it (coords for the pin, place_id as the seed).
              fields: ["formatted_address", "geometry.location", "address_components", "name", "types", "place_id"],
            },
            (result, status) => {
              if (
                status ===
                  window.google.maps.places.PlacesServiceStatus.OK &&
                result
              ) {
                // Clean label ("Francesco, Stockholm") over the verbose
                // formatted_address; fall back if we can't compose one.
                address = composeLocationLabel(result) || result.formatted_address || address;
                if (result.place_id) placeId = result.place_id;
                if (result.geometry?.location) {
                  lat = result.geometry.location.lat();
                  lng = result.geometry.location.lng();
                }
              }
              resolve();
            },
          );
        });
      }
    }

    onChange({ target: { value: address } });

    if (onLocationSelect && lat != null && lng != null) {
      onLocationSelect({
        address,
        lat,
        lng,
        placeId,
      });
    }

    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
  }

  function handleKeyDown(e) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", zIndex: 10000 }}
    >
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={(e) => {
            onFocus?.(e);
            maybeRequestUserLocationForBias();
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={(e) => {
            // Delay to allow click on suggestion
            setTimeout(() => {
              onBlur?.(e);
            }, 200);
          }}
          onKeyDown={handleKeyDown}
          style={style}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            padding: "12px 16px",
            background: colors.background,
            borderRadius: "12px",
            border: `1px solid ${colors.border}`,
            boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            color: colors.textMuted,
            fontSize: "14px",
            textAlign: "center",
            zIndex: 10000,
          }}
        >
          Searching...
      </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && !isLoading && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: colors.background,
            borderRadius: "12px",
            border: `1px solid ${colors.border}`,
            boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
            zIndex: 10000,
            maxHeight: "300px",
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {suggestions.map((suggestion, index) => {
            const isSelected = index === selectedIndex;
            const mainText =
              suggestion.main_text ||
              suggestion.description?.split(",")[0] ||
              "Location";
            const secondaryText =
              suggestion.secondary_text ||
              suggestion.description
                ?.split(",")
                .slice(1, 3)
                .join(", ")
                .trim() ||
              "";

            return (
              <button
                key={suggestion.place_id || index}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: isSelected
                    ? colors.secondarySoft
                    : "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  color: colors.text,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  transition: "background 0.15s ease",
                  borderBottom:
                    index < suggestions.length - 1
                      ? `1px solid ${colors.borderFaint}`
                      : "none",
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                <span
                  style={{
                    flexShrink: 0,
                    marginTop: "2px",
                    color: colors.secondary,
                  }}
                >
                  <MapPin size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      marginBottom: "2px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: colors.text,
                    }}
                  >
                    {mainText}
                  </div>
                  {secondaryText && (
                    <div
                      style={{
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: colors.textSubtle,
                      }}
                    >
                      {secondaryText}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
