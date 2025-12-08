export function PaymentsTab() {
  return (
    <div>
      <h2
        style={{
          fontSize: "18px",
          fontWeight: 600,
          marginBottom: "24px",
        }}
      >
        Payments
      </h2>
      <div
        style={{
          textAlign: "center",
          padding: "60px 24px",
          opacity: 0.6,
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>💳</div>
        <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
          Payments coming soon
        </div>
        <div style={{ fontSize: "14px", opacity: 0.7 }}>
          Payment management features will be available here.
        </div>
      </div>
    </div>
  );
}
