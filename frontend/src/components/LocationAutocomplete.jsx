import { useState, useEffect, useRef } from "react";

// Using OpenStreetMap Nominatim API - completely free, no API key required
// Rate limit: 1 request per second (we debounce to respect this)

export function LocationAutocomplete({
  value,
  onChange,
  onFocus,
  onBlur,
  style,
  placeholder = "Where's the party?",
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
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

    try {
      // OpenStreetMap Nominatim API - free, no API key needed
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
          `format=json&` +
          `q=${encodeURIComponent(query)}&` +
          `limit=5&` +
          `addressdetails=1&` +
          `extratags=1`,
        {
          headers: {
            "User-Agent": "PullUp App", // Required by Nominatim
          },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch suggestions");

      const data = await response.json();
      setSuggestions(data || []);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error("Error fetching location suggestions:", error);
      setSuggestions([]);
    }
  }

  function handleInputChange(e) {
    const newValue = e.target.value;
    onChange(e);

    // Debounce API calls (respects 1 req/sec rate limit)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 500); // 500ms debounce
  }

  function handleSelectSuggestion(suggestion) {
    const address = suggestion.address || {};
    const parts = [];

    // Build location string from address parts
    if (suggestion.name && suggestion.type !== "city") {
      parts.push(suggestion.name);
    }
    if (address.city || address.town || address.village) {
      parts.push(address.city || address.town || address.village);
    }
    if (address.state || address.region) {
      parts.push(address.state || address.region);
    }
    if (address.country) {
      parts.push(address.country);
    }

    const fullLocation = parts.length > 0 
      ? parts.join(", ")
      : suggestion.display_name?.split(",")[0] || suggestion.name || value;

    onChange({ target: { value: fullLocation } });
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

  function formatSuggestion(suggestion) {
    const address = suggestion.address || {};
    const name = suggestion.name || "";
    
    const city = address.city || address.town || address.village || "";
    const country = address.country || "";

    return {
      primary: name || suggestion.display_name?.split(",")[0] || "Location",
      secondary: [city, country].filter(Boolean).join(", ") || suggestion.display_name?.split(",").slice(1, 3).join(", ").trim() || "",
    };
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", zIndex: 10000 }}
    >
      <div style={{ position: "relative" }}>
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
        <span
          style={{
            position: "absolute",
            right: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "18px",
            pointerEvents: "none",
            opacity: 0.6,
          }}
        >
          📍
        </span>
      </div>

      {showSuggestions && suggestions.length > 0 && (
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
            const formatted = formatSuggestion(suggestion);
            const isSelected = index === selectedIndex;

            return (
              <button
                key={suggestion.place_id || index}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: isSelected
                    ? "rgba(139, 92, 246, 0.2)"
                    : "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "all 0.2s ease",
                  borderBottom:
                    index < suggestions.length - 1
                      ? "1px solid rgba(255,255,255,0.05)"
                      : "none",
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseLeave={() => setSelectedIndex(-1)}
              >
                <span style={{ fontSize: "16px", opacity: 0.7 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      marginBottom: "2px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {formatted.primary}
                  </div>
                  {formatted.secondary && (
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.6,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatted.secondary}
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
