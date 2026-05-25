// frontend/src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Detect if the URL contains OAuth callback tokens.
    // If so, don't resolve loading from getSession() — wait for
    // onAuthStateChange to fire with the real session, otherwise
    // ProtectedLayout will see user=null and redirect to "/" too early.
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const hasOAuthTokens =
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=");

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Only resolve loading if there are no pending OAuth tokens to process
      if (!hasOAuthTokens || session) {
        setLoading(false);
      }
    });

    // Listen for auth changes (fires after OAuth tokens are processed)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Safety timeout: if OAuth tokens are present but nothing fires within 5s,
    // stop loading to avoid an infinite spinner
    let safetyTimeout;
    if (hasOAuthTokens) {
      safetyTimeout = setTimeout(() => setLoading(false), 5000);
    }

    return () => {
      subscription.unsubscribe();
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, []);

  // Email + password auth. By default this ONLY signs in — it does NOT
  // create an account on failure. The previous behavior (transparent
  // signup on sign-in failure) had a bad failure mode: a typo'd email
  // would silently mint a new account at the typo address, orphaning
  // the user's real account.
  //
  // To get the old "type-and-go" UX safely, callers pass
  //   { allowAutoCreate: true }
  // which they should ONLY do after the user explicitly confirms
  // "create new account with <typed email>" in the UI.
  //
  // On sign-in failure with "invalid login credentials" and no
  // allowAutoCreate, throws an Error whose .code === "invalid_credentials"
  // so the caller can choose to offer the create-account CTA.
  const signInWithEmailPassword = async (
    email,
    password,
    { allowAutoCreate = false } = {},
  ) => {
    const normalizedEmail = email.trim().toLowerCase();

    // First, try to sign in
    let { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (!error && data) {
      return { data, created: false };
    }

    const message = error?.message?.toLowerCase() ?? "";

    // Surface invalid-email and rate-limit errors directly.
    if (message.includes("email address") && message.includes("invalid")) {
      console.error("Invalid email address for email/password auth:", error);
      throw error;
    }
    if (
      message.includes("email not confirmed") ||
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      console.error("Error signing in with email/password:", error);
      throw error;
    }

    // "Invalid login credentials" is what Supabase returns for both
    // (a) no such account and (b) account exists but wrong password.
    // We can't distinguish them from the client. Without explicit
    // opt-in, don't create an account — let the caller decide whether
    // to prompt for that.
    const looksLikeUnknownUserOrBadPw =
      message.includes("invalid login credentials") ||
      message.includes("user not found") ||
      message.includes("password");

    if (looksLikeUnknownUserOrBadPw && !allowAutoCreate) {
      const e = error || new Error("Invalid login credentials");
      e.code = "invalid_credentials";
      throw e;
    }
    if (!allowAutoCreate) {
      console.error("Error signing in with email/password:", error);
      throw error;
    }

    // Caller explicitly asked for create-on-fail. Proceed with signup.
    const {
      data: signUpData,
      error: signUpError,
    } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });

    if (signUpError) {
      // If Supabase tells us the user already exists, treat it as invalid credentials
      const signUpMessage = signUpError.message?.toLowerCase() ?? "";
      if (signUpMessage.includes("already registered")) {
        const e = error || signUpError;
        e.code = "invalid_credentials";
        throw e;
      }

      console.error("Error signing up with email/password:", signUpError);
      throw signUpError;
    }

    // If email confirmations are disabled, signUpData.session will contain a session
    if (signUpData?.session) {
      return { data: signUpData, created: true };
    }

    // Otherwise, attempt one more sign-in (in case the project auto-confirms)
    const {
      data: signInAfterSignUp,
      error: signInAfterSignUpError,
    } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInAfterSignUpError) {
      console.error(
        "Error signing in after successful email/password sign up:",
        signInAfterSignUpError
      );
      throw signInAfterSignUpError;
    }

    return { data: signInAfterSignUp, created: true };
  };

  const signInWithGoogle = async (returnTo = null) => {
    // Land every OAuth round-trip on the dedicated /auth/callback handler
    // rather than dropping the user straight onto a protected route. The
    // callback waits for the session before forwarding (no redirect race) and
    // surfaces provider errors instead of silently bouncing to login. The
    // original destination rides along as ?next= so we forward there on success.
    const dest =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/events";
    // Always use current origin so the same Supabase project works on localhost and production.
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      dest,
    )}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });
    if (error) {
      console.error("Error signing in with Google:", error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
      throw error;
    }
  };

  const value = {
    user,
    session,
    loading,
    signInWithEmailPassword,
    signInWithGoogle,
    signOut,
    // Helper to get access token for API requests
    getAccessToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
