import { useState, useEffect, useRef } from "react";
import { authenticatedFetch } from "../lib/api.js";

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
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);

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

  async function fetchSuggestions(query) {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:3001"
        }/api/location/autocomplete?query=${encodeURIComponent(query)}`
      );

      if (!response.ok) throw new Error("Failed to fetch suggestions");

      const data = await response.json();
      setSuggestions(data.predictions || []);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error("Error fetching location suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function getPlaceDetails(placeId, source) {
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:3001"
        }/api/location/details?place_id=${encodeURIComponent(
          placeId
        )}&source=${source}`
      );

      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error("Error fetching place details:", error);
    }
    return null;
  }

  function handleInputChange(e) {
    const newValue = e.target.value;
    onChange(e);

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
    let lat = suggestion.lat;
    let lng = suggestion.lon;

    // If using Google Places, fetch details for coordinates
    if (suggestion.source === "google" && suggestion.place_id) {
      const details = await getPlaceDetails(suggestion.place_id, "google");
      if (details) {
        address = details.address || address;
        lat = details.lat;
        lng = details.lng;
      }
    }

    // If Nominatim already has coordinates, use them
    if (suggestion.source === "nominatim" && suggestion.lat && suggestion.lon) {
      lat = parseFloat(suggestion.lat);
      lng = parseFloat(suggestion.lon);
    }

    onChange({ target: { value: address } });

    // Call callback with location data including coordinates
    if (onLocationSelect && lat && lng) {
      onLocationSelect({
        address,
        lat,
        lng,
      });
    }

    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
  }

  async function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Reverse geocode to get address
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?` +
              `format=json&` +
              `lat=${latitude}&` +
              `lon=${longitude}&` +
              `addressdetails=1`,
            {
              headers: {
                "User-Agent": "PullUp App",
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            const address = data.display_name || `${latitude}, ${longitude}`;

            onChange({ target: { value: address } });

            if (onLocationSelect) {
              onLocationSelect({
                address,
                lat: latitude,
                lng: longitude,
              });
            }
          } else {
            // Fallback: just use coordinates
            const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            onChange({ target: { value: address } });

            if (onLocationSelect) {
              onLocationSelect({
                address,
                lat: latitude,
                lng: longitude,
              });
            }
          }
        } catch (error) {
          console.error("Error reverse geocoding:", error);
          // Fallback: use coordinates
          const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          onChange({ target: { value: address } });

          if (onLocationSelect) {
            onLocationSelect({
              address,
              lat: latitude,
              lng: longitude,
            });
          }
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(
          "Unable to get your location. Please check your browser permissions."
        );
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
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

        {/* Current Location Button */}
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={disabled || isGettingLocation}
          style={{
            marginLeft: "8px",
            padding: "10px 14px",
            background: isGettingLocation
              ? "rgba(139, 92, 246, 0.3)"
              : "rgba(139, 92, 246, 0.15)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: "10px",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: disabled || isGettingLocation ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexShrink: 0,
            transition: "all 0.2s ease",
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !isGettingLocation) {
              e.target.style.background = "rgba(139, 92, 246, 0.25)";
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled && !isGettingLocation) {
              e.target.style.background = "rgba(139, 92, 246, 0.15)";
            }
          }}
        >
          <span style={{ fontSize: "16px" }}>
            {isGettingLocation ? "⏳" : ""}
          </span>
          <span style={{ display: isGettingLocation ? "none" : "inline" }}>
            Current
          </span>
        </button>
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
            background: "rgba(12, 10, 18, 0.98)",
            backdropFilter: "blur(20px)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
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
            background: "rgba(12, 10, 18, 0.98)",
            backdropFilter: "blur(20px)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
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
                  padding: "14px 16px",
                  background: isSelected
                    ? "rgba(139, 92, 246, 0.2)"
                    : "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  transition: "all 0.15s ease",
                  borderBottom:
                    index < suggestions.length - 1
                      ? "1px solid rgba(255,255,255,0.05)"
                      : "none",
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                <span
                  style={{
                    fontSize: "18px",
                    opacity: 0.8,
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  📍
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      marginBottom: "4px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "#fff",
                    }}
                  >
                    {mainText}
                  </div>
                  {secondaryText && (
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.65,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "rgba(255,255,255,0.8)",
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
