// src/components/HomeSettingsTab.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function SettingsTab({ user, setUser, onSave, showToast }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      showToast("Failed to sign out", "error");
    }
  };
  // Initialize from user state with defaults
  const brandingLinks = user.brandingLinks || {
    instagram: "",
    x: "",
    youtube: "",
    tiktok: "",
    linkedin: "",
    website: "",
  };
  const emails = user.emails || [
    { email: user.email || "felix.civalero@gmail.com", primary: true },
  ];
  const mobileNumber = user.mobileNumber || "";
  const thirdPartyAccounts = user.thirdPartyAccounts || [
    {
      id: "google",
      name: "Google",
      email: user.email || "felix.civalero@gmail.com",
      linked: false,
    },
    { id: "apple", name: "Apple", linked: false },
    { id: "zoom", name: "Zoom", linked: false },
    { id: "solana", name: "Solana", linked: false },
    { id: "ethereum", name: "Ethereum", linked: false },
  ];
  const [activeDevices] = useState([
    {
      id: "1",
      name: "Chrome on macOS",
      location: "Stockholm, SE",
      current: true,
    },
  ]);

  async function handleSave() {
    try {
      await onSave(user);
      showToast("Settings saved successfully! ✨", "success");
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Failed to save settings", "error");
    }
  }

  function handleAddEmail() {
    setUser({
      ...user,
      emails: [...emails, { email: "", primary: false }],
    });
  }

  function handleRemoveBrandingLink(platform) {
    setUser({
      ...user,
      brandingLinks: { ...brandingLinks, [platform]: "" },
    });
  }

  function handleLinkThirdParty(id) {
    setUser({
      ...user,
      thirdPartyAccounts: thirdPartyAccounts.map((acc) =>
        acc.id === id ? { ...acc, linked: !acc.linked } : acc
      ),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      <style>{`
        .settings-input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(20, 16, 30, 0.6);
          color: #fff;
          font-size: 15px;
          outline: none;
        }
        .settings-input-container {
          width: 100%;
        }
        .branding-link-input {
          flex: 1;
          min-width: 0;
          box-sizing: border-box;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(20, 16, 30, 0.6);
          color: #fff;
          font-size: 15px;
          outline: none;
        }
      `}</style>
      {/* PROFILE */}
      <SettingsSection
        title="Your Profile"
        description="Choose how you are displayed as a host or guest."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "32px",
            alignItems: "start",
          }}
        >
          {/* Left side: fields */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              width: "100%",
            }}
          >
            {/* Brand */}
            <label style={{ display: "block", width: "100%" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Brand
              </div>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  type="text"
                  value={user.brand || ""}
                  onChange={(e) => setUser({ ...user, brand: e.target.value })}
                  placeholder="Brand"
                  className="settings-input"
                />
              </div>
            </label>

            {/* Host Name */}
            <label style={{ display: "block", width: "100%" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Host Name
              </div>
              <input
                type="text"
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
                className="settings-input"
              />
            </label>

            {/* Bio */}
            <label style={{ display: "block", width: "100%" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Bio
              </div>
              <textarea
                value={user.bio}
                onChange={(e) => setUser({ ...user, bio: e.target.value })}
                placeholder="Share a little about your background and interests."
                className="settings-input"
                style={{
                  minHeight: "100px",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </label>

            {/* Branding Links */}
            <div style={{ marginTop: "8px", width: "100%" }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.9,
                }}
              >
                Branding Links
              </div>
              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.6,
                  marginBottom: "16px",
                  fontStyle: "italic",
                }}
              >
                Visual data will be automatically fetched from these links
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  width: "100%",
                }}
              >
                {/* Instagram */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>📷</span>
                  <span
                    style={{
                      fontSize: "14px",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    instagram.com/
                  </span>
                  <input
                    type="text"
                    value={brandingLinks.instagram}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: {
                          ...brandingLinks,
                          instagram: e.target.value,
                        },
                      })
                    }
                    placeholder="username"
                    className="branding-link-input"
                  />
                </div>

                {/* X / Twitter */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>𝕏</span>
                  <span
                    style={{
                      fontSize: "14px",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    x.com/
                  </span>
                  <input
                    type="text"
                    value={brandingLinks.x}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: { ...brandingLinks, x: e.target.value },
                      })
                    }
                    placeholder="username"
                    className="branding-link-input"
                  />
                  {brandingLinks.x && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBrandingLink("x")}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "none",
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* YouTube */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>▶️</span>
                  <span
                    style={{
                      fontSize: "14px",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    youtube.com/@
                  </span>
                  <input
                    type="text"
                    value={brandingLinks.youtube}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: {
                          ...brandingLinks,
                          youtube: e.target.value,
                        },
                      })
                    }
                    placeholder="username"
                    className="branding-link-input"
                  />
                </div>

                {/* TikTok */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>🎵</span>
                  <span
                    style={{
                      fontSize: "14px",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    tiktok.com/@
                  </span>
                  <input
                    type="text"
                    value={brandingLinks.tiktok}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: {
                          ...brandingLinks,
                          tiktok: e.target.value,
                        },
                      })
                    }
                    placeholder="username"
                    className="branding-link-input"
                  />
                </div>

                {/* LinkedIn */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>💼</span>
                  <span
                    style={{
                      fontSize: "14px",
                      opacity: 0.8,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    linkedin.com
                  </span>
                  <input
                    type="text"
                    value={brandingLinks.linkedin}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: {
                          ...brandingLinks,
                          linkedin: e.target.value,
                        },
                      })
                    }
                    placeholder="/in/handle"
                    className="branding-link-input"
                  />
                </div>

                {/* Website */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>🌐</span>
                  <input
                    type="text"
                    value={brandingLinks.website}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        brandingLinks: {
                          ...brandingLinks,
                          website: e.target.value,
                        },
                      })
                    }
                    placeholder="Your website"
                    className="branding-link-input"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* EMAILS */}
      <SettingsSection
        title="Emails"
        description="Add additional emails to receive event invitations sent to those addresses."
        actionButton={
          <button
            type="button"
            onClick={handleAddEmail}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(139, 92, 246, 0.2)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>+</span>
            <span>Add Email</span>
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {emails.map((email, idx) => (
            <div
              key={idx}
              style={{
                padding: "16px",
                background: "rgba(20, 16, 30, 0.6)",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    marginBottom: "4px",
                  }}
                >
                  {email.email}
                </div>
                {email.primary && (
                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.7,
                    }}
                  >
                    This email will be shared with hosts when you register for
                    their events.
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {email.primary && (
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      background: "rgba(139, 92, 246, 0.2)",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    Primary
                  </span>
                )}
                <button
                  type="button"
                  style={{
                    padding: "6px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    fontSize: "18px",
                  }}
                >
                  ⋮
                </button>
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* MOBILE NUMBER */}
      <SettingsSection
        title="Mobile Number"
        description="Manage the mobile number you use to sign in to PullUp and receive SMS updates."
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <input
            type="tel"
            value={mobileNumber}
            onChange={(e) => setUser({ ...user, mobileNumber: e.target.value })}
            className="settings-input"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            style={{
              padding: "12px 20px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Update
          </button>
        </div>
        <div
          style={{
            marginTop: "12px",
            fontSize: "13px",
            opacity: 0.6,
          }}
        >
          For your security, we will send you a code to verify any change to
          your mobile number.
        </div>
      </SettingsSection>

      {/* PASSWORD & SECURITY */}
      <SettingsSection
        title="Password & Security"
        description="Secure your account with password and two-factor authentication."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SecurityItem
            icon="🔒"
            title="Account Password"
            description="Please follow the instructions in the email to finish setting your password."
            buttonText="Set Password"
          />
          <SecurityItem
            icon="🛡️"
            title="Two-Factor Authentication"
            description="Please set a password before enabling two-factor authentication."
            buttonText="Enable 2FA"
          />
          <SecurityItem
            icon="🔑"
            title="Passkeys"
            description="Passkeys are a secure and convenient way to sign in."
            buttonText="Add Passkey"
          />
        </div>
      </SettingsSection>

      {/* THIRD PARTY ACCOUNTS */}
      <SettingsSection
        title="Third Party Accounts"
        description="Link your accounts to sign in to PullUp and automate your workflows."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {thirdPartyAccounts.map((account) => (
            <div
              key={account.id}
              style={{
                padding: "16px",
                background: "rgba(20, 16, 30, 0.6)",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontSize: "20px" }}>
                  {account.id === "google" && "G"}
                  {account.id === "apple" && "🍎"}
                  {account.id === "zoom" && "📹"}
                  {account.id === "solana" && "S"}
                  {account.id === "ethereum" && "Ξ"}
                </span>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>
                  {account.name}
                </span>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.7,
                  marginBottom: "8px",
                }}
              >
                {account.linked ? account.email || "Linked" : "Not Linked"}
              </div>
              <button
                type="button"
                onClick={() => handleLinkThirdParty(account.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: account.linked
                    ? "1px solid rgba(255,255,255,0.1)"
                    : "none",
                  background: account.linked
                    ? "transparent"
                    : "rgba(139, 92, 246, 0.2)",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {account.linked ? (
                  <>
                    <span>✓</span>
                    <span>Linked</span>
                  </>
                ) : (
                  <>
                    <span>+</span>
                    <span>Link</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* ACTIVE DEVICES */}
      <SettingsSection
        title="Active Devices"
        description="See the list of devices you are currently signed into PullUp from."
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {activeDevices.map((device) => (
            <div
              key={device.id}
              style={{
                padding: "16px",
                background: "rgba(20, 16, 30, 0.6)",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "20px" }}>💻</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    marginBottom: "4px",
                  }}
                >
                  {device.name}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7 }}>
                  {device.location}
                </div>
              </div>
              {device.current && (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "12px",
                    background: "rgba(34, 197, 94, 0.2)",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#22c55e",
                  }}
                >
                  This Device
                </span>
              )}
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* SIGN OUT */}
      <SettingsSection
        title="Sign Out"
        description="Sign out of your PullUp account. You can sign back in at any time."
      >
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: "12px 24px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(255,255,255,0.05)";
          }}
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </SettingsSection>

      {/* DELETE ACCOUNT */}
      <SettingsSection
        title="Delete Account"
        description="If you no longer wish to use PullUp, you can permanently delete your account."
      >
        <button
          type="button"
          style={{
            padding: "12px 24px",
            borderRadius: "12px",
            border: "none",
            background: "rgba(239, 68, 68, 0.2)",
            color: "#ef4444",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(239, 68, 68, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(239, 68, 68, 0.2)";
          }}
        >
          <span>⚠️</span>
          <span>Delete My Account</span>
        </button>
      </SettingsSection>

      {/* SAVE BUTTON */}
      <button
        type="button"
        onClick={handleSave}
        style={{
          marginTop: "32px",
          padding: "14px 28px",
          borderRadius: "999px",
          border: "none",
          background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "15px",
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
          transition: "all 0.3s ease",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>🔄</span>
        <span>Save Changes</span>
      </button>
    </div>
  );
}

function SettingsSection({ title, description, children, actionButton }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: "14px",
              opacity: 0.7,
            }}
          >
            {description}
          </p>
        </div>
        {actionButton && actionButton}
      </div>
      {children}
    </div>
  );
}

export function SecurityItem({ icon, title, description, buttonText }) {
  return (
    <div
      style={{
        padding: "16px",
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", gap: "12px", flex: 1 }}>
        <span style={{ fontSize: "20px", marginTop: "2px" }}>{icon}</span>
        <div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>{description}</div>
        </div>
      </div>
      <button
        type="button"
        style={{
          padding: "8px 16px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(139, 92, 246, 0.2)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {buttonText}
      </button>
    </div>
  );
}
