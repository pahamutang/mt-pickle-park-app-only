import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabaseClient';
import { useBooking } from './BookingContext';
import { useAuth } from './AuthContext';

// One entry in the owner's notification bell. Three kinds:
//   account          - someone created a new account
//   payment_pending  - a player paid via GCash and is waiting for the owner to verify
//   payment_approved - a player's payment was verified/accepted
export type NotificationKind = 'account' | 'payment_pending' | 'payment_approved';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle?: string;
  createdAt: string;
  seen: boolean;
  // Set for payment notifications so the bell can jump to the verification list.
  reservationId?: string;
}

interface NotificationsValue {
  unseenCount: number;
  notifications: AppNotification[];
  toast: AppNotification | null;
  dismissToast: () => void;
  markAllSeen: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | undefined>(undefined);

const MAX_LIST = 30;
const MAX_APPROVED = 10;
const TOAST_DURATION_MS = 5000;
const SEEN_KEY = 'seen_payment_notifications_v1';
const MAX_SEEN_STORED = 300;

interface AccountRow {
  id: string;
  displayName: string | null;
  createdAt: string;
  seen: boolean;
}

function rowToAccount(row: any): AccountRow {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    seen: row.seen,
  };
}

function accountToNotification(a: AccountRow): AppNotification {
  return {
    id: `account:${a.id}`,
    kind: 'account',
    title: `${a.displayName || 'A new player'} created an account`,
    createdAt: a.createdAt,
    seen: a.seen,
  };
}

function formatHours(hours: number[]): string {
  const n = hours.length;
  return `${n} hr${n === 1 ? '' : 's'}`;
}

// Only ever mounted inside OwnerApp (see App.tsx), and inside BookingProvider,
// so a player's account never gets it. It merges three sources into one feed:
//   1) new accounts (account_notifications table, realtime)
//   2) payments waiting for verification (derived from `reservations`, which
//      BookingContext already keeps fresh via realtime + 10s polling)
//   3) recently verified payments (same source)
// There's no push notification on purpose: it only works while the owner has
// the app open, exactly like the new-account alert always did.
export function AccountNotificationsProvider({ children }: { children: ReactNode }) {
  const { reservations, loading: bookingsLoading } = useBooking();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [seenPaymentIds, setSeenPaymentIds] = useState<string[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending-payment ids we already knew about, so only genuinely NEW ones toast.
  const knownPendingRef = useRef<Set<string> | null>(null);

  const showToast = useCallback((n: AppNotification) => {
    setToast(n);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  // ---- new accounts -------------------------------------------------------
  const fetchAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('account_notifications')
      .select('id, profile_id, display_name, created_at, seen')
      .order('created_at', { ascending: false })
      .limit(MAX_LIST);
    if (error) {
      console.warn('Failed to load account notifications', error);
      return;
    }
    setAccounts((data ?? []).map(rowToAccount));
  }, []);

  useEffect(() => {
    fetchAccounts();

    const channel = supabase
      .channel('account-notifications-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'account_notifications' },
        (payload) => {
          const a = rowToAccount(payload.new);
          setAccounts((prev) => [a, ...prev].slice(0, MAX_LIST));
          showToast(accountToNotification(a));
        }
      )
      .subscribe();

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fetchAccounts();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchAccounts, showToast]);

  // ---- which payment alerts the owner has already looked at ---------------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Corrupt/old data (not a list of ids) would crash new Set() below.
          if (Array.isArray(parsed)) {
            setSeenPaymentIds(parsed.filter((x): x is string => typeof x === 'string'));
          }
        }
      } catch (e) {
        console.warn('Failed to load seen payment notifications', e);
      } finally {
        setSeenLoaded(true);
      }
    })();
  }, []);

  // ---- payments, derived from reservations --------------------------------
  // Made by players only: the owner's own bookings are auto-approved and
  // never need verifying.
  const paymentNotifications = useMemo<AppNotification[]>(() => {
    const seen = new Set(seenPaymentIds);
    const playerRows = reservations.filter((r) => r.createdBy !== myId);

    const pending: AppNotification[] = playerRows
      .filter((r) => r.status === 'pending')
      .map((r) => {
        // Hour count is part of the id: if the player adds more time (with a
        // new screenshot) to a still-pending booking, it alerts again.
        const id = `pending:${r.id}:${r.hours.length}`;
        return {
          id,
          kind: 'payment_pending' as const,
          title: `${r.customerName} is waiting for payment verification`,
          subtitle: `${r.court} · ${r.date} · ${formatHours(r.hours)}`,
          createdAt: new Date(r.createdAt).toISOString(),
          seen: seen.has(id),
          reservationId: r.id,
        };
      });

    // Informational history only: it never adds to the badge (the owner
    // approved these themselves, and old data would flood the count).
    const approved: AppNotification[] = playerRows
      .filter((r) => r.status === 'approved' && r.isPaid)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_APPROVED)
      .map((r) => ({
        id: `approved:${r.id}`,
        kind: 'payment_approved' as const,
        title: `Payment verified for ${r.customerName}`,
        subtitle: `${r.court} · ${r.date} · ${formatHours(r.hours)}`,
        createdAt: new Date(r.createdAt).toISOString(),
        seen: true,
        reservationId: r.id,
      }));

    return [...pending, ...approved];
  }, [reservations, seenPaymentIds, myId]);

  // Toast (and only a toast) when a new pending payment shows up while the
  // owner has the app open. The first load just records what already exists.
  useEffect(() => {
    if (bookingsLoading || !seenLoaded) return;
    const pendingNow = paymentNotifications.filter((n) => n.kind === 'payment_pending');
    if (knownPendingRef.current === null) {
      knownPendingRef.current = new Set(pendingNow.map((n) => n.id));
      return;
    }
    const fresh = pendingNow.filter((n) => !knownPendingRef.current!.has(n.id));
    fresh.forEach((n) => knownPendingRef.current!.add(n.id));
    if (fresh.length > 0) showToast(fresh[0]);
  }, [paymentNotifications, bookingsLoading, seenLoaded, showToast]);

  // ---- merged feed --------------------------------------------------------
  const notifications = useMemo<AppNotification[]>(() => {
    const all = [...accounts.map(accountToNotification), ...paymentNotifications];
    // Compare real instants: database timestamps ("...+00:00") and JS ones ("...Z")
    // don't sort correctly as plain text.
    const t = (iso: string) => {
      const ms = new Date(iso).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };
    all.sort((a, b) => t(b.createdAt) - t(a.createdAt));
    return all.slice(0, MAX_LIST);
  }, [accounts, paymentNotifications]);

  const unseenCount = notifications.filter((n) => !n.seen).length;

  const markAllSeen = useCallback(async () => {
    // Payments: remember locally (this device).
    const unseenPayments = paymentNotifications.filter((n) => !n.seen).map((n) => n.id);
    if (unseenPayments.length > 0) {
      const next = [...seenPaymentIds, ...unseenPayments].slice(-MAX_SEEN_STORED);
      setSeenPaymentIds(next);
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch((e) =>
        console.warn('Failed to save seen payment notifications', e)
      );
    }

    // Accounts: flip the flag in the database, as before.
    const unseenAccountIds = accounts.filter((a) => !a.seen).map((a) => a.id);
    if (unseenAccountIds.length > 0) {
      setAccounts((prev) => prev.map((a) => ({ ...a, seen: true })));
      const { error } = await supabase
        .from('account_notifications')
        .update({ seen: true })
        .in('id', unseenAccountIds);
      if (error) {
        console.warn('Failed to mark account notifications seen', error);
        fetchAccounts();
      }
    }
  }, [paymentNotifications, seenPaymentIds, accounts, fetchAccounts]);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ unseenCount, notifications, toast, dismissToast, markAllSeen }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useAccountNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useAccountNotifications must be used within an AccountNotificationsProvider');
  return ctx;
}
