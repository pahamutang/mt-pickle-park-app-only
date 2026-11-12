import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabaseClient';
import type { MutationResult } from './BookingContext';

// Whether each court is open to online booking right now. This is NOT
// per-date — closing a court closes it on every date at once, until the
// owner opens it again (see supabase_court_status_migration.sql). A
// closed court still physically exists and can be played on (open play /
// walk-ins at the park) — it just can't be booked through the app.
//
// Shared Supabase table, read by everyone, written by the owner only, and
// kept live-synced via realtime the same way BookingContext and
// VenuePhotosContext are — a court the owner closes disappears from
// bookability on every player's screen immediately, no reinstall needed.

interface CourtStatusContextValue {
  loading: boolean;
  // true = open for booking, false = closed (open play only). A court
  // with no row yet (migration not run, or a court added since) is
  // treated as closed — the safe default — never as open.
  isOpen: (court: string) => boolean;
  setOpen: (court: string, open: boolean) => Promise<MutationResult>;
  // Bulk action for "individual or multi" open/close in one tap — sets
  // every court in `courts` to the same open/closed state.
  setOpenMany: (courts: string[], open: boolean) => Promise<MutationResult>;
}

const CourtStatusContext = createContext<CourtStatusContextValue | undefined>(undefined);

type CourtStatusRow = {
  court: string;
  is_open: boolean;
};

function describeError(error: unknown): string {
  const raw = (error as any)?.message as string | undefined;
  const code = (error as any)?.code as string | undefined;
  if (!raw) return 'Something went wrong. Please try again.';
  const lower = raw.toLowerCase();
  if (
    (lower.includes('relation') && lower.includes('does not exist')) ||
    code === 'PGRST205' ||
    lower.includes('schema cache')
  ) {
    return 'Court open/closed status hasn\'t been set up in Supabase yet. Run supabase_court_status_migration.sql in the Supabase SQL editor, then try again.';
  }
  if (lower.includes('row-level security') || lower.includes('policy')) {
    return "You don't have permission to do that.";
  }
  return raw;
}

export function CourtStatusProvider({ children }: { children: ReactNode }) {
  const [statusByCourt, setStatusByCourt] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  // Same coalesced-refetch guard as BookingContext/VenuePhotosContext: a
  // burst of realtime events (e.g. "Close All" updating 3 rows at once)
  // should never leave a fetch half-applied.
  const fetchingRef = useRef(false);
  const refetchPendingRef = useRef(false);

  const fetchAll = async () => {
    if (fetchingRef.current) {
      refetchPendingRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      do {
        refetchPendingRef.current = false;
        const { data, error } = await supabase.from('court_status').select('court, is_open');
        if (error) {
          console.warn('Failed to load court status', error);
          break;
        }
        const rows = (data ?? []) as CourtStatusRow[];
        const next: Record<string, boolean> = {};
        for (const row of rows) next[row.court] = row.is_open;
        setStatusByCourt(next);
      } while (refetchPendingRef.current);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('court-status-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_status' }, fetchAll)
      .subscribe();

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fetchAll();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closed (false) is the safe default for a court this device hasn't
  // heard a status for yet — never silently treat an unknown court as
  // bookable.
  const isOpen = (court: string) => statusByCourt[court] ?? false;

  const setOpen = async (court: string, open: boolean): Promise<MutationResult> => {
    const { error } = await supabase
      .from('court_status')
      .upsert({ court, is_open: open, updated_at: new Date().toISOString() }, { onConflict: 'court' });
    if (error) {
      console.warn('Failed to update court status', error);
      return { ok: false, error: describeError(error) };
    }
    setStatusByCourt((prev) => ({ ...prev, [court]: open }));
    return { ok: true };
  };

  const setOpenMany = async (courts: string[], open: boolean): Promise<MutationResult> => {
    if (courts.length === 0) return { ok: true };
    const rows = courts.map((court) => ({
      court,
      is_open: open,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('court_status').upsert(rows, { onConflict: 'court' });
    if (error) {
      console.warn('Failed to update court status', error);
      return { ok: false, error: describeError(error) };
    }
    setStatusByCourt((prev) => {
      const next = { ...prev };
      for (const court of courts) next[court] = open;
      return next;
    });
    return { ok: true };
  };

  return (
    <CourtStatusContext.Provider value={{ loading, isOpen, setOpen, setOpenMany }}>
      {children}
    </CourtStatusContext.Provider>
  );
}

export function useCourtStatus() {
  const ctx = useContext(CourtStatusContext);
  if (!ctx) {
    throw new Error('useCourtStatus must be used within a CourtStatusProvider');
  }
  return ctx;
}
