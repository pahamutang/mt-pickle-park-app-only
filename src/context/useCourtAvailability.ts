import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabaseClient';

// Whether the owner has opened an owner-managed court (Court 2) for
// reservations. Stored in the shared `court_settings` table (see
// supabase_court2_open_toggle.sql) and live-synced via realtime.
//
// Fails safe: if the table doesn't exist yet, a row is missing, or a read
// fails, the court is treated as OPEN — i.e. the app behaves exactly as it
// did before this feature.
const COURT = 'Court 2';

export function useCourtAvailability() {
  const [court2Open, setCourt2Open] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const fetchState = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('court_settings')
        .select('is_open')
        .eq('court', COURT)
        .maybeSingle();
      if (error) {
        console.warn('Failed to load court settings', error);
        return;
      }
      setCourt2Open(data ? data.is_open !== false : true);
    } catch (e) {
      console.warn('Failed to load court settings', e);
    }
  }, []);

  useEffect(() => {
    fetchState();

    const channel = supabase
      .channel(`court-settings-sync-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_settings' }, fetchState)
      .subscribe();

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fetchState();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
  }, [fetchState]);

  // Owner-only (enforced by RLS too). Returns { ok } or { ok:false, error }.
  const setCourt2OpenState = useCallback(
    async (open: boolean): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (savingRef.current) return { ok: false, error: 'Please wait, still saving.' };
      savingRef.current = true;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('court_settings')
          .upsert({ court: COURT, is_open: open, updated_at: new Date().toISOString() }, { onConflict: 'court' });
        if (error) {
          const raw = (error.message ?? '').toLowerCase();
          if (
            (raw.includes('relation') && raw.includes('does not exist')) ||
            (error as any).code === 'PGRST205' ||
            raw.includes('schema cache')
          ) {
            return {
              ok: false,
              error:
                "Court settings haven't been set up in Supabase yet. Run supabase_court2_open_toggle.sql in the Supabase SQL editor, then try again.",
            };
          }
          if (raw.includes('row-level security') || raw.includes('policy')) {
            return { ok: false, error: 'Only the owner can open or close a court.' };
          }
          return { ok: false, error: error.message || 'Something went wrong. Please try again.' };
        }
        setCourt2Open(open);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Something went wrong. Please try again.' };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    []
  );

  return { court2Open, saving, setCourt2Open: setCourt2OpenState };
}
