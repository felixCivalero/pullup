// frontend/src/components/ui/Card.jsx
export function Card({ children, style, ...props }) {
  return (
    <div
      style={{
        background: "rgba(20, 16, 30, 0.6)",
        backdropFilter: "blur(10px)",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "24px",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
