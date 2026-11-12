import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { ReservationRemoveKind } from '../bookingTypes';

const COPY: Record<
  ReservationRemoveKind,
  { title: string; sub: string; confirm: string }
> = {
  cancel: {
    title: 'Cancel this reservation?',
    sub: "This can't be undone.",
    confirm: 'Cancel Reservation',
  },
  clear: {
    title: 'Clear this reservation?',
    sub: 'This removes the declined request from the list.',
    confirm: 'Clear',
  },
  remove: {
    title: 'Remove this paid reservation?',
    sub: "This frees up the time slot and can't be undone.",
    confirm: 'Remove Reservation',
  },
};

export default function CancelReservationModal({
  visible,
  customerName,
  courtName,
  dateLabel,
  kind = 'cancel',
  onKeep,
  onConfirm,
}: {
  visible: boolean;
  customerName: string;
  courtName: string;
  dateLabel: string;
  kind?: ReservationRemoveKind;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const copy = COPY[kind];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.message}>
            <Text style={styles.messageStrong}>{customerName}</Text> — {courtName}, {dateLabel}
          </Text>
          <Text style={styles.subMessage}>{copy.sub}</Text>

          <View style={styles.divider} />

          <View style={styles.actions}>
            <Pressable onPress={onKeep} style={styles.keepBtn}>
              <Text style={styles.keepBtnLabel}>Keep It</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={styles.confirmBtn}>
              <Text style={styles.confirmBtnLabel}>{copy.confirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F8D2D2',
  },
  iconText: { fontSize: 26 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  messageStrong: { fontWeight: '700', color: '#1a1a1a' },
  subMessage: {
    fontSize: 12,
    color: AppColors.crimsonRed,
    fontWeight: '600',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    width: '100%',
    marginTop: 20,
    marginBottom: 16,
  },
  actions: { width: '100%', gap: 10 },
  keepBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: AppColors.background,
  },
  keepBtnLabel: { color: AppColors.forestGreen, fontWeight: '700', fontSize: 14 },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: AppColors.crimsonRed,
  },
  confirmBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
