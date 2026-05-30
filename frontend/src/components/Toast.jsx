import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { colors } from "../theme/colors.js";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(
    (message, type = "info", subtext = null, duration = 4000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type, subtext, duration }]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          subtext={toast.subtext}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </>
  );
}

// Left accent bar color and icon tint per type
function getAccentColor(type) {
  if (type === "success") return colors.success;
  if (type === "error") return colors.danger;
  if (type === "warning") return colors.warning;
  return colors.accent; // info / default → pink
}

function Toast({
  message,
  type = "info",
  subtext = null,
  onClose,
  duration = 4000,
}) {
  const onCloseRef = useRef(onClose);

  // Keep ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]); // Removed onClose from dependencies

  const accent = getAccentColor(type);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#ffffff",
        color: colors.text,
        padding: subtext ? "14px 20px 14px 16px" : "12px 20px 12px 16px",
        borderRadius: "12px",
        border: `1px solid ${colors.border}`,
        boxShadow: "0 8px 30px rgba(10,10,10,0.10)",
        zIndex: 1000,
        fontSize: "14px",
        fontWeight: 500,
        maxWidth: "90%",
        textAlign: "left",
        animation: "slideUp 0.3s ease-out",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        minWidth: 220,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          width: 3,
          borderRadius: 2,
          background: accent,
          alignSelf: "stretch",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: colors.text, marginBottom: subtext ? "4px" : "0" }}>
          {message}
        </div>
        {subtext && (
          <div
            style={{
              fontSize: "12px",
              color: colors.textMuted,
              marginTop: "4px",
              fontWeight: 400,
            }}
          >
            {subtext}
          </div>
        )}
      </div>
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
