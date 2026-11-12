import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppColors } from '../colors';
import { useAuth } from '../context/AuthContext';
import { MT_PICKLE_LOGO_BASE64 } from '../services/mtPickleLogoBase64';
import { Alert } from '../utils/dialog';

type Mode = 'signIn' | 'signUp';

// Owner-only. Players never sign in or create an account — they book straight
// from the public booking screen — so this screen says so up front and gives
// them a one-tap way back. `onClose` returns to the booking screen.
export default function AuthScreen({ onClose }: { onClose?: () => void } = {}) {
  const { signIn, signUp, signOut, claimOwnerRole } = useAuth();
  // Wide screens get the landscape artwork, tall ones the portrait artwork.
  // The background is sized from the live window size so it always fills the
  // screen (phones, tablets, resized desktop windows, mobile browser bars).
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const bgSource = isLandscape
    ? require('../../assets/login_bg_landscape.jpg')
    : require('../../assets/login_bg.jpg');
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ownerPin, setOwnerPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Whether the PIN's own characters are currently masked, mirroring the
  // password field's show/hide toggle so a typo'd PIN can be checked too.
  const [pinVisible, setPinVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (
      !email.trim() ||
      !password.trim() ||
      (mode === 'signUp' && (!displayName.trim() || !ownerPin.trim()))
    ) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      const errMsg =
        mode === 'signIn'
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, displayName.trim());

      if (errMsg) {
        setError(errMsg);
        setSubmitting(false);
        return;
      }

      if (mode === 'signUp') {
        const ok = await claimOwnerRole(ownerPin.trim());
        if (!ok) {
          // Not the owner: sign this account straight back out so it never
          // reaches the app. This screen unmounts as the session changes, so
          // an inline error would never be seen — use the app-wide dialog.
          await signOut();
          Alert.alert(
            'Owner PIN incorrect',
            "That owner PIN was incorrect (or your email still needs confirming), so no owner access was granted. Players don't need an account — just reserve a court."
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImageBackground
      source={bgSource}
      style={[styles.flex, { width, height }]}
      imageStyle={styles.bgImage}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {onClose && (
            <Pressable
              onPress={onClose}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to court reservations"
            >
              <Text style={styles.backBtnText}>‹ Back to courts</Text>
            </Pressable>
          )}
          <Image source={{ uri: MT_PICKLE_LOGO_BASE64 }} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Mt Pickle Park</Text>
          <Text style={styles.subtitle}>
            {mode === 'signIn' ? 'Owner sign in' : 'Create owner account'}
          </Text>

          {/* The whole point of this screen: it is NOT for players. */}
          <View style={styles.ownerOnlyBox} accessibilityRole="alert">
            <Text style={styles.ownerOnlyTitle}>OWNERS ONLY</Text>
            <Text style={styles.ownerOnlyText}>
              This sign-in is for the Mt Pickle Park owner. Players don't need an account — go back
              and reserve a court, no sign in required.
            </Text>
            {onClose && (
              <Pressable
                onPress={onClose}
                style={styles.ownerOnlyBtn}
                accessibilityRole="button"
                accessibilityLabel="Back to booking, no sign in needed"
              >
                <Text style={styles.ownerOnlyBtnText}>I'm a player — back to booking</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.card}>
            {mode === 'signUp' && (
              <>
                <Text style={styles.label}>Owner name</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="e.g. Juan"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
              </>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={PLACEHOLDER_COLOR}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow} collapsable={false}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={PLACEHOLDER_COLOR}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="off"
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.showPasswordBtn}>
                <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>

            {mode === 'signUp' && (
              <>
                <Text style={styles.label}>Owner PIN</Text>
                <View style={styles.passwordRow} collapsable={false}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={ownerPin}
                    onChangeText={setOwnerPin}
                    placeholder="Owner PIN"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                    secureTextEntry={!pinVisible}
                    autoComplete="off"
                  />
                  <Pressable onPress={() => setPinVisible((v) => !v)} style={styles.showPasswordBtn}>
                    <Text style={styles.showPasswordText}>{pinVisible ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{mode === 'signIn' ? 'Sign In' : 'Create Owner Account'}</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                setError(null);
              }}
              style={styles.switchBtn}
            >
              <Text style={styles.switchText}>
                {mode === 'signIn' ? 'First time? Create the owner account' : 'Already have the owner account? Sign in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

// Light grey so the sample text clearly reads as a hint, not typed input.
const PLACEHOLDER_COLOR = 'rgba(0,0,0,0.25)';

const styles = StyleSheet.create({
  // forestGreen shows only for the instant before the background image loads.
  flex: { flex: 1, backgroundColor: AppColors.forestGreen, overflow: 'hidden' },
  // Fill the whole container and keep the artwork centered when cropped.
  bgImage: { width: '100%', height: '100%' },
  keyboardAvoid: { flex: 1 },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 88, height: 88, marginBottom: 12, borderRadius: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
  },
  showPasswordBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  showPasswordText: {
    color: AppColors.forestGreen,
    fontSize: 13,
    fontWeight: '600',
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8 },
  backBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  ownerOnlyBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFF4D6',
    borderColor: AppColors.gold,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: -8,
    marginBottom: 16,
  },
  ownerOnlyTitle: { fontSize: 13, fontWeight: 'bold', color: '#7A5B00', letterSpacing: 1, marginBottom: 4 },
  ownerOnlyText: { fontSize: 13, color: '#4A3A00', lineHeight: 18 },
  ownerOnlyBtn: {
    marginTop: 10,
    backgroundColor: AppColors.forestGreen,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ownerOnlyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  error: { color: AppColors.crimsonRed, fontSize: 13, marginTop: 12 },
  submitBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  switchBtn: { marginTop: 14, alignItems: 'center' },
  switchText: { color: AppColors.navy, fontSize: 13 },
});
