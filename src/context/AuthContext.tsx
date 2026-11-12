import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, createProbeClient } from '../services/supabaseClient';

export type Role = 'owner' | 'player';

interface Profile {
  id: string;
  role: Role;
  display_name: string | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // True while a real (non-guest) account's profile (role) is being fetched,
  // so the router shows a spinner instead of flashing the wrong screen.
  // `profileFailed` is set if every attempt failed.
  profileLoading: boolean;
  profileFailed: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  // Owner-only: resolves to an error message, or null on success. Accounts
  // that aren't the owner are rejected here and never get a session.
  signIn: (email: string, password: string) => Promise<string | null>;
  // Players never create an account. The first time one actually books, the
  // app quietly gives their device a throwaway anonymous session so the
  // booking has an id to belong to. Returns that id, or an error message.
  ensureGuestSession: () => Promise<{ userId: string | null; error?: string }>;
  signOut: () => Promise<void>;
  // Returns true if the pin matched and the account is now the owner.
  claimOwnerRole: (pin: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);

  // Which user the latest loadProfile call was for. A slow response for a
  // previous user (sign out -> sign in as someone else) must never land
  // after a newer one and overwrite it with the wrong role/name.
  const latestProfileUserRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    latestProfileUserRef.current = userId;
    setProfileLoading(true);
    setProfileFailed(false);
    // Retry a few times: right after sign-up the profile row is created by a
    // database trigger and can lag the session by a moment, and a flaky
    // network shouldn't bounce a freshly signed-in person to an error.
    const MAX_ATTEMPTS = 4;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, display_name')
        .eq('id', userId)
        .single();
      if (latestProfileUserRef.current !== userId) return; // superseded
      if (!error && data) {
        setProfile(data as Profile);
        setProfileLoading(false);
        return;
      }
      console.warn('Failed to load profile (attempt ' + (attempt + 1) + ')', error);
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        if (latestProfileUserRef.current !== userId) return;
      }
    }
    setProfile(null);
    setProfileFailed(true);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      // A guest (anonymous) session has no role worth loading.
      if (data.session && !data.session.user.is_anonymous) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user.is_anonymous) {
        latestProfileUserRef.current = null;
        setProfile(null);
        setProfileLoading(false);
        setProfileFailed(false);
      } else if (newSession) {
        // If a DIFFERENT account just signed in, drop the previous
        // account's profile right away. Otherwise RootRouter keeps
        // rendering the old role's screens (e.g. the owner app for a
        // player who just signed in on the same device) until the new
        // profile finishes loading.
        setProfile((prev) => (prev && prev.id !== newSession.user.id ? null : prev));
        loadProfile(newSession.user.id);
      } else {
        latestProfileUserRef.current = null;
        setProfile(null);
        setProfileLoading(false);
        setProfileFailed(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return error ? error.message : null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Check the account on a throwaway client first: only the owner may sign
    // in. A player (or anyone else) is turned away without their current
    // guest session being touched.
    const probe = createProbeClient();
    const { data: probed, error: probeError } = await probe.auth.signInWithPassword({
      email,
      password,
    });
    if (probeError || !probed.user) {
      return probeError?.message ?? 'Could not sign in. Please try again.';
    }
    const { data: row, error: roleError } = await probe
      .from('profiles')
      .select('role')
      .eq('id', probed.user.id)
      .maybeSingle();
    await probe.auth.signOut().catch(() => {});
    if (roleError || !row) {
      return "Couldn't verify this account. Please check your connection and try again.";
    }
    if (row.role !== 'owner') {
      return 'This sign-in is for the owner only. Players don\'t need an account — go back and reserve your court.';
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const guestPromiseRef = useRef<Promise<{ userId: string | null; error?: string }> | null>(null);
  const ensureGuestSession = useCallback(async () => {
    // Ask the client itself (not React state, which can lag a render behind).
    const { data } = await supabase.auth.getSession();
    if (data.session) return { userId: data.session.user.id };
    // Two quick taps must not create two anonymous users.
    if (guestPromiseRef.current) return guestPromiseRef.current;
    const failure = {
      userId: null,
      error: "We couldn't start your booking right now. Please check your connection and try again.",
    };
    const attempt = (async () => {
      try {
        const { data: created, error } = await supabase.auth.signInAnonymously();
        if (error || !created.user) {
          console.warn('Anonymous sign-in failed', error);
          return failure;
        }
        return { userId: created.user.id };
      } catch (e) {
        console.warn('Anonymous sign-in threw', e);
        return failure;
      } finally {
        guestPromiseRef.current = null;
      }
    })();
    guestPromiseRef.current = attempt;
    return attempt;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const claimOwnerRole = useCallback(
    async (pin: string) => {
      const { data, error } = await supabase.rpc('claim_owner_role', { pin });
      if (error) {
        console.warn('claim_owner_role failed', error);
        return false;
      }
      if (data === true) {
        // Don't use the `session` captured in this callback's closure —
        // this is very often called immediately after signUp(), and this
        // closure can still be holding the pre-signup snapshot (`session`
        // was null when it was created), which silently skipped the
        // profile reload below and left the UI showing the player screens
        // until the next app launch, even though the database's role had
        // already been updated correctly. Ask Supabase for the session
        // fresh instead — we know one exists, since the RPC call above
        // only succeeds when authenticated.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await loadProfile(sessionData.session.user.id);
        }
      }
      return data === true;
    },
    [loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        profileLoading,
        profileFailed,
        signUp,
        signIn,
        ensureGuestSession,
        signOut,
        claimOwnerRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
