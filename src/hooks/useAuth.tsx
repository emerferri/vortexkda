import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      console.log('Iniciando logout...');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Erro ao sair:', error);
      } else {
        console.log('Logout realizado com sucesso');
        // Redirecionamento explícito após logout
        window.location.href = '/auth';
      }
    } catch (err) {
      console.error('Erro inesperado no logout:', err);
    }
  };

  return { user, session, loading, signOut };
};
