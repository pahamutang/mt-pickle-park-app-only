import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import {
  Reservation,
  formatFriendlyDate,
  reservationRemoveKind,
  reservationTotal,
  slotLabelsForHours,
} from '../bookingTypes';
import { ownerFacebookLink } from '../contactConfig';
import { formatCurrency } from '../utils/currency';
import PaidChip from './PaidChip';

const HIDDEN_KEY = 'hidden_upcoming_reservations_v1';
// Keeps the saved list from growing forever as old reservations pile up.
const MAX_HIDDEN = 500;

export interface ReservationGroup {
  key: string;
  customerName: string;
  date: string;
  items: Reservation[];
  total: number;
}

// Full-screen(ish) list of every upcoming reservation, park-wide. Pulled
// out from the home screen's inline list into a modal behind a button so
// that a busy day with many bookings doesn't stack up and push the rest
// of the home screen (venue info, location, etc.) further and further
// down — the trigger button shows a count, and this is where the actual
// list lives now.
export default function UpcomingReservationsModal({
  visible,
  onClose,
  groups,
  isOwner,
  canRemove,
  onTogglePaid,
  onCancel,
  onViewProof,
  onApprove,
}: {
  visible: boolean;
  onClose: () => void;
  groups: ReservationGroup[];
  isOwner: boolean;
  canRemove: (r: Reservation) => boolean;
  onTogglePaid: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
  onViewProof: (r: Reservation) => void;
  onApprove: (r: Reservation) => void;
}) {
  // Ids of individual reservations the person chose to hide. Hiding is per
  // reservation (not per grouped card), so a brand-new booking added to the
  // same person/day always shows up with its own Hide button instead of being
  // swallowed by an already-hidden card. Purely a local view preference —
  // nothing is deleted or cancelled — saved on the device.
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  // Always holds the latest list so rapid taps never work from a stale copy.
  const hiddenRef = useRef<string[]>([]);

  const applyHidden = useCallback((next: string[]) => {
    const capped = Array.from(new Set(next)).slice(-MAX_HIDDEN);
    hiddenRef.current = capped;
    setHiddenIds(capped);
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(capped)).catch(() => {});
  }, []);

  // Load what was hidden last time. Merged with anything hidden while the
  // load was still in flight, so a fast tap is never overwritten.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const saved = parsed.filter((x): x is string => typeof x === 'string');
        const merged = Array.from(new Set([...saved, ...hiddenRef.current]));
        hiddenRef.current = merged;
        setHiddenIds(merged);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reopening the popup always starts on the normal list.
  useEffect(() => {
    if (!visible) {
      setShowHidden(false);
      setContactError(false);
    }
  }, [visible]);

  // "Contact the Owner" — players only (the owner doesn't need to message
  // themselves). Opens the owner's Facebook in the browser / Facebook app.
  const [contactError, setContactError] = useState(false);
  const ownerLink = useMemo(() => ownerFacebookLink(), []);
  const contactOwner = () => {
    if (!ownerLink) return;
    setContactError(false);
    try {
      Linking.openURL(ownerLink).catch(() => setContactError(true));
    } catch {
      setContactError(true);
    }
  };

  const isHidden = useCallback((r: Reservation) => hiddenIds.includes(r.id), [hiddenIds]);
  const hideOne = (r: Reservation) => applyHidden([...hiddenRef.current, r.id]);
  const unhideOne = (r: Reservation) => applyHidden(hiddenRef.current.filter((id) => id !== r.id));

  const allIds = useMemo(() => groups.flatMap((g) => g.items.map((r) => r.id)), [groups]);
  const hiddenCount = useMemo(() => allIds.filter((id) => hiddenIds.includes(id)).length, [allIds, hiddenIds]);
  const visibleCount = allIds.length - hiddenCount;
  const hideAll = () => applyHidden([...hiddenRef.current, ...allIds]);
  const unhideAll = () => applyHidden(hiddenRef.current.filter((id) => !allIds.includes(id)));

  // Normal view drops hidden reservations (and recomputes each card's total);
  // "show hidden" view keeps everything, with hidden ones dimmed.
  const visibleGroups = useMemo(() => {
    if (showHidden) return groups;
    return groups
      .map((g) => {
        const items = g.items.filter((r) => !hiddenIds.includes(r.id));
        const total = items.reduce((sum, r) => (r.status === 'declined' ? sum : sum + reservationTotal(r)), 0);
        return { ...g, items, total };
      })
      .filter((g) => g.items.length > 0);
  }, [groups, hiddenIds, showHidden]);

  // If nothing is hidden anymore, drop back to the normal view.
  useEffect(() => {
    if (hiddenCount === 0 && showHidden) setShowHidden(false);
  }, [hiddenCount, showHidden]);

  const hideButton = (r: Reservation) =>
    isHidden(r) ? (
      <Pressable
        onPress={() => unhideOne(r)}
        hitSlop={8}
        style={styles.hideBtn}
        accessibilityRole="button"
        accessibilityLabel="Unhide reservation"
      >
        <Text style={styles.hideBtnText}>Unhide</Text>
      </Pressable>
    ) : (
      <Pressable
        onPress={() => hideOne(r)}
        hitSlop={8}
        style={styles.hideBtn}
        accessibilityRole="button"
        accessibilityLabel="Hide reservation"
      >
        <Text style={styles.hideBtnText}>Hide</Text>
      </Pressable>
    );

  const chip = (r: Reservation) => {
    if (r.status === 'pending') {
      return (
        <View style={[styles.statusChip, { backgroundColor: '#FCE8A6' }]}>
          <Text style={[styles.statusChipText, { color: '#8A6D00' }]}>⏳ VERIFYING</Text>
        </View>
      );
    }
    if (r.status === 'declined') {
      return (
        <View style={[styles.statusChip, { backgroundColor: AppColors.crimsonRed }]}>
          <Text style={[styles.statusChipText, { color: '#fff' }]}>DECLINED</Text>
        </View>
      );
    }
    return <PaidChip paid={r.isPaid} onPress={isOwner ? () => onTogglePaid(r) : undefined} />;
  };
  const showsVerifyActions = (r: Reservation) => isOwner && r.status === 'pending';
  // Unpaid -> text "Cancel"; declined -> text "Clear"; paid -> an X button.
  // Owner-side pending rows already get Approve/Cancel buttons, so skip them here.
  const removeAction = (r: Reservation, style?: object) => {
    if (!canRemove(r) || showsVerifyActions(r)) return null;
    const kind = reservationRemoveKind(r);
    if (kind === 'remove') {
      return (
        <Pressable
          onPress={() => onCancel(r)}
          hitSlop={8}
          style={[styles.xBtn, style]}
          accessibilityRole="button"
          accessibilityLabel="Remove reservation"
        >
          <Text style={styles.xIcon}>✕</Text>
        </Pressable>
      );
    }
    return (
      <Pressable onPress={() => onCancel(r)} hitSlop={8} style={style} accessibilityRole="button">
        <Text style={styles.cancelText}>{kind === 'clear' ? 'Clear' : 'Cancel'}</Text>
      </Pressable>
    );
  };
  const verifyActions = (r: Reservation) =>
    showsVerifyActions(r) ? (
      <View style={styles.verifyRow}>
        <Pressable onPress={() => onApprove(r)} style={[styles.verifyBtn, { backgroundColor: AppColors.forestGreen }]} accessibilityRole="button">
          <Text style={styles.verifyBtnText}>✓ Approve</Text>
        </Pressable>
        <Pressable onPress={() => onCancel(r)} style={[styles.verifyBtn, { backgroundColor: AppColors.crimsonRed }]} accessibilityRole="button">
          <Text style={styles.verifyBtnText}>✕ Cancel</Text>
        </Pressable>
      </View>
    ) : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          <Text style={styles.title}>Upcoming Reservations</Text>
          <View style={styles.divider} />

          {allIds.length > 0 && (
            <View style={styles.toolbar}>
              {hiddenCount > 0 && (
                <Pressable
                  onPress={() => setShowHidden((v) => !v)}
                  style={styles.toggleHiddenBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.toggleHiddenText}>
                    {showHidden ? `Back to list` : `Show hidden (${hiddenCount})`}
                  </Text>
                </Pressable>
              )}
              {visibleCount > 0 && (
                <Pressable onPress={hideAll} style={styles.toggleHiddenBtn} accessibilityRole="button">
                  <Text style={styles.toggleHiddenText}>Hide all</Text>
                </Pressable>
              )}
              {showHidden && hiddenCount > 0 && (
                <Pressable onPress={unhideAll} style={styles.toggleHiddenBtn} accessibilityRole="button">
                  <Text style={styles.toggleHiddenText}>Unhide all</Text>
                </Pressable>
              )}
            </View>
          )}

          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No upcoming reservations yet.</Text>
          ) : visibleGroups.length === 0 ? (
            <Text style={styles.emptyText}>All reservations are hidden. Tap "Show hidden" above to see them.</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
              {visibleGroups.map((g) => {
                if (g.items.length === 1) {
                  const r = g.items[0];
                  return (
                    <View key={g.key} style={[styles.reservationCard, isHidden(r) && styles.hiddenCard]}>
                      <View style={styles.reservationHeader}>
                        <Text style={styles.reservationName}>{r.customerName}</Text>
                        {chip(r)}
                      </View>
                      <Text style={styles.reservationDetail}>
                        {r.court} · {formatFriendlyDate(r.date)}
                      </Text>
                      <Text style={styles.reservationDetail}>{slotLabelsForHours(r.hours).join(', ')}</Text>
                      <Text style={styles.reservationDetail}>
                        {r.players} player{r.players === 1 ? '' : 's'}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </Text>
                      {isOwner && r.paymentProofs.length > 0 && (
                        <Pressable onPress={() => onViewProof(r)} accessibilityRole="button" style={{ marginTop: 6 }}>
                          <Text style={styles.proofText}>📸 View payment proof</Text>
                        </Pressable>
                      )}
                      {verifyActions(r)}
                      <View style={styles.reservationFooter}>
                        <Text style={styles.reservationTotal}>{formatCurrency(reservationTotal(r))}</Text>
                        {removeAction(r)}
                      </View>
                      <View style={styles.hideRow}>{hideButton(r)}</View>
                    </View>
                  );
                }

                return (
                  <View key={g.key} style={styles.reservationCard}>
                    <View style={styles.reservationHeader}>
                      <Text style={styles.reservationName}>{g.customerName}</Text>
                      <Text style={styles.reservationDetail}>{formatFriendlyDate(g.date)}</Text>
                    </View>
                    {g.items.map((r, i) => (
                      <View
                        key={r.id}
                        style={[
                          isHidden(r) && styles.hiddenCard,
                          styles.reservationSubRow,
                          i < g.items.length - 1 && styles.reservationSubRowDivider,
                        ]}
                      >
                        <View style={styles.reservationSubMain}>
                          <View style={styles.reservationSubHeaderRow}>
                            <Text style={styles.reservationCourtName}>{r.court}</Text>
                            {chip(r)}
                          </View>
                          <Text style={styles.reservationDetail}>{slotLabelsForHours(r.hours).join(', ')}</Text>
                          <Text style={styles.reservationDetail}>
                            {r.players} player{r.players === 1 ? '' : 's'}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </Text>
                          {isOwner && r.paymentProofs.length > 0 && (
                            <Pressable onPress={() => onViewProof(r)} accessibilityRole="button" style={{ marginTop: 4 }}>
                              <Text style={styles.proofText}>📸 View payment proof</Text>
                            </Pressable>
                          )}
                          {verifyActions(r)}
                        </View>
                        <View style={styles.reservationSubAside}>
                          <Text style={styles.reservationTotal}>{formatCurrency(reservationTotal(r))}</Text>
                          {removeAction(r, { marginTop: 6 })}
                          <View style={{ marginTop: 6 }}>{hideButton(r)}</View>
                        </View>
                      </View>
                    ))}
                    <View style={styles.reservationFooter}>
                      <Text style={styles.reservationDetail}>{g.items.length} court{g.items.length === 1 ? '' : 's'}</Text>
                      <Text style={styles.reservationTotal}>{formatCurrency(g.total)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {!isOwner && ownerLink && (
            <View style={styles.contactWrap}>
              <Pressable
                onPress={contactOwner}
                style={styles.contactBtn}
                accessibilityRole="link"
                accessibilityLabel="Contact the owner on Facebook"
              >
                <Text style={styles.contactBtnText}>Contact the Owner</Text>
              </Pressable>
              {contactError && (
                <Text style={styles.contactError}>Couldn't open Facebook. Please try again.</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '82%',
    backgroundColor: AppColors.background,
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    borderWidth: 1,
    borderColor: '#eee',
  },
  closeIcon: { fontSize: 15, fontWeight: 'bold', color: '#555' },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: AppColors.forestGreen,
    paddingRight: 40,
    paddingHorizontal: 4,
  },
  divider: { height: 1, backgroundColor: '#e5e3da', marginTop: 12, marginBottom: 4 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  // flexShrink defaults to 0 in React Native (unlike web CSS, where it
  // defaults to 1) — without it, a long list won't actually scroll
  // within the card's maxHeight, it'll just push the card taller than
  // its bound and spill out. Explicit flexShrink: 1 is what makes this
  // ScrollView respect `card`'s maxHeight and become internally
  // scrollable instead — the whole point of this component existing.
  list: { flexGrow: 0, flexShrink: 1, marginTop: 8 },

  reservationCard: {
    backgroundColor: '#fff',
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reservationName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  reservationDetail: { fontSize: 12.5, color: '#666', marginTop: 2 },
  reservationSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reservationSubRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reservationSubMain: { flex: 1, paddingRight: 10 },
  reservationSubAside: { alignItems: 'flex-end' },
  reservationSubHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  reservationCourtName: { fontSize: 13.5, fontWeight: '700', color: '#222', marginRight: 8 },
  reservationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  reservationTotal: { fontSize: 14, fontWeight: 'bold', color: AppColors.forestGreen },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontWeight: 'bold' },
  verifyRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  verifyBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  proofText: { color: '#0B5CB8', fontSize: 12.5, fontWeight: '600' },
  cancelText: { color: AppColors.crimsonRed, fontSize: 13, fontWeight: '600' },
  xBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F8D2D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  hideBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F2F1EA',
    borderWidth: 1,
    borderColor: '#e5e3da',
  },
  hideBtnText: { fontSize: 12, fontWeight: '600', color: '#555' },
  hiddenCard: { opacity: 0.55 },
  contactWrap: { marginTop: 6 },
  contactBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  contactError: { color: AppColors.crimsonRed, fontSize: 12, textAlign: 'center', marginTop: 6 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  toggleHiddenBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: AppColors.forestGreen,
  },
  toggleHiddenText: { fontSize: 12.5, fontWeight: '700', color: AppColors.forestGreen },
  xIcon: { color: AppColors.crimsonRed, fontSize: 13, fontWeight: 'bold' },
});
