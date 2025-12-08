export function ProfileHeader({ user, stats }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 24,
        marginBottom: 32,
        paddingBottom: 32,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          flexShrink: 0,
          border: "2px solid rgba(255,255,255,0.1)",
        }}
      >
        😊
      </div>

      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontSize: "clamp(24px, 4vw, 32px)",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {user.name}
        </h1>
        <div
          style={{
            fontSize: 14,
            opacity: 0.7,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>📅</span>
          <span>Joined {user.joinedDate}</span>
        </div>
        <div
          style={{
            fontSize: 14,
            opacity: 0.8,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong>{stats.hosted}</strong> Hosted
          </span>
          <span>
            <strong>{stats.attended}</strong> Attended
          </span>
        </div>
      </div>
    </div>
  );
}
