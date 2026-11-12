import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { getPaymentProofUrls } from '../services/paymentProofStorage';

// Owner-only: shows the GCash screenshot(s) a player attached to a reservation.
export default function PaymentProofViewerModal({
  paths,
  title,
  onClose,
}: {
  paths: string[] | null;
  title: string;
  onClose: () => void;
}) {
  const [urls, setUrls] = useState<string[] | null>(null);

  useEffect(() => {
    if (!paths) {
      setUrls(null);
      return;
    }
    let cancelled = false;
    getPaymentProofUrls(paths).then((u) => {
      if (!cancelled) setUrls(u);
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  return (
    <Modal visible={!!paths} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Payment proof</Text>
          <Text style={styles.subtitle}>{title}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {urls === null ? (
              <ActivityIndicator color={AppColors.forestGreen} />
            ) : urls.length === 0 ? (
              <Text style={styles.empty}>Couldn't load the screenshot.</Text>
            ) : (
              urls.map((u) => (
                <Image key={u} source={{ uri: u }} style={styles.image} resizeMode="contain" />
              ))
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
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
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: AppColors.forestGreen },
  subtitle: { fontSize: 12.5, color: '#666', marginTop: 2 },
  scroll: { flexShrink: 1, marginTop: 12 },
  scrollContent: { alignItems: 'center', gap: 10 },
  image: { width: '100%', height: 420, borderRadius: 8, backgroundColor: '#f3f3f3' },
  empty: { color: '#888', fontSize: 13, paddingVertical: 20 },
  button: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
