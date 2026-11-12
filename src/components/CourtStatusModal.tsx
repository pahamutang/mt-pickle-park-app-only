import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { Court } from '../bookingTypes';
import { useCourtStatus } from '../context/CourtStatusContext';
import AlertModal from './AlertModal';

// Owner-only. Every court starts closed (open play only — see
// supabase_court_status_migration.sql) until the owner opens it here,
// one at a time or several at once. A court marked "comingSoon" in
// bookingTypes.ts (Court 3 right now) is left out: it doesn't exist yet,
// so there's nothing for the owner to open or close.
export default function CourtStatusModal({
  visible,
  onClose,
  courts,
}: {
  visible: boolean;
  onClose: () => void;
  courts: Court[];
}) {
  const { isOpen, setOpen, setOpenMany } = useCourtStatus();
  const [savingCourt, setSavingCourt] = useState<string | null>(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const manageable = courts.filter((c) => !c.comingSoon);
  const busy = savingBulk || savingCourt !== null;

  const toggleOne = async (court: Court) => {
    setSavingCourt(court.name);
    const result = await setOpen(court.name, !isOpen(court.name));
    setSavingCourt(null);
    if (!result.ok) {
      setAlert({
        title: "Couldn't update court",
        message: result.error ?? 'Please check your connection and try again.',
      });
    }
  };

  const bulkSet = async (open: boolean) => {
    setSavingBulk(true);
    const result = await setOpenMany(
      manageable.map((c) => c.name),
      open
    );
    setSavingBulk(false);
    if (!result.ok) {
      setAlert({
        title: "Couldn't update courts",
        message: result.error ?? 'Please check your connection and try again.',
      });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Manage Courts</Text>
          <Text style={styles.subtitle}>
            A closed court shows "Open Play" on every time slot instead of being bookable — it
            still exists for walk-ins, it just can't be reserved online until you open it.
          </Text>

          <View style={styles.bulkRow}>
            <Pressable
              onPress={() => bulkSet(true)}
              disabled={busy}
              style={[styles.bulkBtn, styles.bulkBtnOpen, busy && styles.btnDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.bulkBtnText}>Open All</Text>
            </Pressable>
            <Pressable
              onPress={() => bulkSet(false)}
              disabled={busy}
              style={[styles.bulkBtn, styles.bulkBtnClose, busy && styles.btnDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.bulkBtnText}>Close All</Text>
            </Pressable>
          </View>

          {manageable.map((court) => {
            const open = isOpen(court.name);
            const savingThis = savingCourt === court.name;
            return (
              <View key={court.name} style={styles.courtRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courtName}>{court.name}</Text>
                  <View style={[styles.statusChip, open ? styles.statusChipOpen : styles.statusChipClosed]}>
                    <Text style={[styles.statusChipText, open ? styles.statusTextOpen : styles.statusTextClosed]}>
                      {open ? 'OPEN FOR BOOKING' : 'CLOSED — OPEN PLAY'}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => toggleOne(court)}
                  disabled={busy}
                  style={[
                    styles.toggleBtn,
                    open ? styles.toggleBtnClose : styles.toggleBtnOpen,
                    busy && styles.btnDisabled,
                  ]}
                  accessibilityRole="button"
                >
                  {savingThis ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.toggleBtnText}>{open ? 'Close' : 'Open'}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}

          <Pressable onPress={onClose} disabled={busy} style={styles.doneBtn} accessibilityRole="button">
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>

      <AlertModal
        visible={!!alert}
        variant="error"
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />
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
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: AppColors.forestGreen },
  subtitle: { fontSize: 12.5, color: '#666', marginTop: 6, lineHeight: 17 },
  bulkRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  bulkBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  bulkBtnOpen: { backgroundColor: AppColors.forestGreen },
  bulkBtnClose: { backgroundColor: '#8a8a8a' },
  bulkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  courtName: { fontSize: 14.5, fontWeight: '700', color: '#222' },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  statusChipOpen: { backgroundColor: '#DFF5E3' },
  statusChipClosed: { backgroundColor: '#F3F1EA' },
  statusChipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  statusTextOpen: { color: '#1E7A3C' },
  statusTextClosed: { color: '#8a8060' },
  toggleBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9, minWidth: 72, alignItems: 'center' },
  toggleBtnOpen: { backgroundColor: AppColors.forestGreen },
  toggleBtnClose: { backgroundColor: AppColors.crimsonRed },
  toggleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  doneBtn: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  doneBtnText: { color: '#444', fontWeight: '700', fontSize: 14 },
});
