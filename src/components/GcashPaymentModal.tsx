import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';
import { GCASH } from '../paymentConfig';

const QR_IMAGE = require('../../assets/gcash_qr.jpg');
const QR_RATIO = 912 / 1345; // width / height of the QR image

export interface PaymentProofAsset {
  base64: string;
  uri: string;
}

// Shown when a player presses "Reserve Court". GCash is the only way to
// pay, and the reservation can't be saved until a screenshot of the
// payment is attached — the confirm button stays disabled until then.
export default function GcashPaymentModal({
  visible,
  total,
  asset,
  busy,
  onAssetChange,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  total: number;
  asset: PaymentProofAsset | null;
  busy: boolean;
  onAssetChange: (asset: PaymentProofAsset | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const qrW = Math.min(240, winW - 96);
  const qrH = qrW / QR_RATIO;
  const bigW = Math.min(winW, (winH - 120) * QR_RATIO);
  const bigH = bigW / QR_RATIO;

  useEffect(() => {
    if (!visible) {
      setQrOpen(false);
      setPickError(null);
    }
  }, [visible]);

  const pickScreenshot = async () => {
    setPickError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPickError('Allow photo library access in your device settings to attach your screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets[0];
    if (!picked.base64) {
      setPickError("Couldn't read that image. Please try a different screenshot.");
      return;
    }
    onAssetChange({ base64: picked.base64, uri: picked.uri });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Pay with GCash</Text>
            <Text style={styles.subtitle}>
              Pay first, then attach your payment screenshot to complete the reservation.
            </Text>

            <View style={styles.payCard}>
              <Text style={styles.paySubtitle}>1. Scan the QR code to pay</Text>
              <Pressable
                onPress={() => setQrOpen(true)}
                style={styles.qrPress}
                accessibilityRole="button"
                accessibilityLabel="Enlarge GCash QR code"
              >
                {qrFailed ? (
                  <View style={[styles.qr, { width: qrW, height: 80, justifyContent: 'center' }]}>
                    <Text style={styles.payMeta}>
                      Couldn't load the QR code. Please close this and try again.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Image
                      source={QR_IMAGE}
                      style={[styles.qr, { width: qrW, height: qrH }]}
                      resizeMode="contain"
                      onError={() => setQrFailed(true)}
                      accessibilityLabel="GCash QR code"
                    />
                    <View style={styles.enlargeBadge}>
                      <Text style={styles.enlargeBadgeText}>🔍 Tap to enlarge</Text>
                    </View>
                  </>
                )}
              </Pressable>
              <Text style={styles.payAmount}>Amount to pay: {formatCurrency(total)}</Text>
              {!!GCASH.accountName && <Text style={styles.payMeta}>Account name: {GCASH.accountName}</Text>}
              {!!GCASH.number && <Text style={styles.payMeta}>GCash number: {GCASH.number}</Text>}
            </View>

            <View style={styles.proofCard}>
              <Text style={styles.proofTitle}>2. Attach your payment screenshot</Text>
              {asset ? (
                <Image source={{ uri: asset.uri }} style={styles.proofPreview} resizeMode="contain" />
              ) : (
                <Text style={styles.proofHint}>Required — you can't reserve without it.</Text>
              )}
              <Pressable
                onPress={pickScreenshot}
                disabled={busy}
                style={styles.pickBtn}
                accessibilityRole="button"
              >
                <Text style={styles.pickBtnText}>{asset ? 'Change screenshot' : '📸 Choose screenshot'}</Text>
              </Pressable>
              {!!pickError && <Text style={styles.error}>{pickError}</Text>}
            </View>
          </ScrollView>

          <Pressable
            onPress={onConfirm}
            disabled={!asset || busy}
            style={[styles.confirmBtn, (!asset || busy) && styles.confirmBtnDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !asset || busy }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.confirmText}>Confirm Reservation</Text>
            )}
          </Pressable>
          <Pressable onPress={onCancel} disabled={busy} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={styles.cancelText}>Back</Text>
          </Pressable>
        </View>

        {qrOpen && (
          <Pressable
            style={styles.qrOverlay}
            onPress={() => setQrOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close enlarged QR code"
          >
            <Text style={styles.qrOverlayHint}>Scan this with GCash or your banking app</Text>
            <Image
              source={QR_IMAGE}
              style={{ width: bigW, height: bigH }}
              resizeMode="contain"
              accessibilityLabel="Enlarged GCash QR code"
            />
            <View style={styles.qrCloseBtn}>
              <Text style={styles.qrCloseText}>✕  Tap anywhere to close</Text>
            </View>
          </Pressable>
        )}
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
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  scroll: { width: '100%', flexShrink: 1 },
  scrollContent: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#0B5CB8', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#5a6b7d', marginTop: 4, textAlign: 'center', lineHeight: 17 },
  payCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD9F5',
    backgroundColor: '#F2F8FF',
    padding: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  paySubtitle: { fontSize: 13, fontWeight: '700', color: '#0B5CB8' },
  qrPress: { marginTop: 12, alignSelf: 'center', alignItems: 'center' },
  qr: { borderRadius: 10 },
  enlargeBadge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  enlargeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  payAmount: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginTop: 12 },
  payMeta: { fontSize: 12, color: '#444', marginTop: 3 },
  proofCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3DC93',
    backgroundColor: '#FFF6DB',
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  proofTitle: { fontSize: 13, fontWeight: '700', color: '#6b5200' },
  proofHint: { fontSize: 12, color: '#6b5200', marginTop: 6 },
  proofPreview: { width: '100%', height: 160, marginTop: 10, borderRadius: 8, backgroundColor: '#fff' },
  pickBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6b93f',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pickBtnText: { color: '#6b5200', fontWeight: '700', fontSize: 13 },
  error: { color: AppColors.crimsonRed, fontSize: 12, marginTop: 8, textAlign: 'center' },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
    backgroundColor: AppColors.forestGreen,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { paddingVertical: 10, marginTop: 4 },
  cancelText: { color: '#666', fontSize: 13, fontWeight: '600' },
  qrOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Same solid blue as the GCash screenshot's own background, so the
    // picture melts into the screen with no black bands above/below it.
    backgroundColor: '#015BE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrOverlayHint: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  qrCloseBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  qrCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
