// frontend/src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmailPassword = async (email, password) => {
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

    // If Supabase thinks the email itself is invalid, surface that directly and stop
    if (message.includes("email address") && message.includes("invalid")) {
      console.error("Invalid email address for email/password auth:", error);
      throw error;
    }

    // If credentials are wrong for an existing account, surface that back to the caller
    if (
      message.includes("email not confirmed") ||
      message.includes("password") ||
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      console.error("Error signing in with email/password:", error);
      throw error;
    }

    // For "invalid login credentials" / "user not found" cases, transparently create an account
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
        console.error(
          "Email/password sign in failed: user already exists with different credentials."
        );
        throw error || signUpError;
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
    // Always use current origin so same Supabase project works on localhost and production
    const redirectTo = returnTo
      ? `${window.location.origin}${returnTo}`
      : `${window.location.origin}/events`;

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
