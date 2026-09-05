import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export interface Operator {
  id: string;
  email: string;
  merchantId: string;
  demo: boolean;
}

interface AuthContextValue {
  loading: boolean;
  configured: boolean;
  operator: Operator | null;
  signIn: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  continueLocally: () => void;
}

const LOCAL_FLAG = 'revive-local-operator';

const LOCAL_OPERATOR: Operator = {
  id: 'local-demo',
  email: 'operator@local',
  merchantId: 'local-demo',
  demo: true,
};

function hasLocalOverride() {
  try {
    return localStorage.getItem(LOCAL_FLAG) === '1';
  } catch {
    return false;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

function operatorFromUser(user: User): Operator {
  return {
    id: user.id,
    email: user.email || 'operator',
    merchantId: user.id,
    demo: false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [operator, setOperator] = useState<Operator | null>(
    configured && !hasLocalOverride() ? null : LOCAL_OPERATOR,
  );

  useEffect(() => {
    if (!supabase) {
      setOperator(LOCAL_OPERATOR);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) setOperator(operatorFromUser(user));
      else if (hasLocalOverride()) setOperator(LOCAL_OPERATOR);
      else setOperator(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        setOperator(operatorFromUser(user));
        return;
      }
      setOperator(hasLocalOverride() ? LOCAL_OPERATOR : null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Supabase is not configured. Continue as a local operator.' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }, []);

  const continueLocally = useCallback(() => {
    localStorage.setItem(LOCAL_FLAG, '1');
    setOperator(LOCAL_OPERATOR);
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(LOCAL_FLAG);
    if (supabase) await supabase.auth.signOut();
    setOperator(configured ? null : LOCAL_OPERATOR);
  }, [configured]);

  const value = useMemo(
    () => ({ loading, configured, operator, signIn, signOut, continueLocally }),
    [loading, configured, operator, signIn, signOut, continueLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
