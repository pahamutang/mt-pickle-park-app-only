import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PaymentLogProvider } from './src/context/PaymentLogContext';
import { PlayersProvider } from './src/context/PlayersContext';
import { BookingProvider } from './src/context/BookingContext';
import { VenuePhotosProvider } from './src/context/VenuePhotosContext';
import { AccountNotificationsProvider } from './src/context/AccountNotificationsContext';
import BookingScreen from './src/screens/BookingScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PaymentHistoryScreen from './src/screens/PaymentHistoryScreen';
import AuthScreen from './src/screens/AuthScreen';
import NewAccountToast from './src/components/NewAccountToast';
import { AppColors } from './src/colors';
import { DialogHost } from './src/utils/dialog';

type MainTab = 'booking' | 'legacy';
type LegacyScreen = 'home' | 'settings' | 'history';

// The full owner app — booking + the legacy session/payment tracker, and
// everything that can add players, log orders, or mark things paid. Only
// ever rendered once we know the signed-in account's role is 'owner'; a
// player's account never even receives these providers or components, so
// there's nothing for them to reach into.
function OwnerApp() {
  const [mainTab, setMainTab] = useState<MainTab>('booking');
  const [legacyScreen, setLegacyScreen] = useState<LegacyScreen>('home');

  return (
    <PaymentLogProvider>
      <PlayersProvider>
        <BookingProvider>
          <VenuePhotosProvider>
            {/* Only ever mounted here — new-account badge/toast only exist
                for the owner, and only while the owner's app is actually
                open (mounting/unmounting this provider is what turns the
                realtime subscription behind it on and off). */}
            <AccountNotificationsProvider>
              <View style={styles.ownerAppRoot}>
                {mainTab === 'booking' && (
                  <BookingScreen onOpenLegacy={() => setMainTab('legacy')} />
                )}

                {mainTab === 'legacy' && legacyScreen === 'home' && (
                  <HomeScreen
                    onOpenSettings={() => setLegacyScreen('settings')}
                    onOpenHistory={() => setLegacyScreen('history')}
                    onOpenBooking={() => setMainTab('booking')}
                  />
                )}

                {mainTab === 'legacy' && legacyScreen === 'settings' && (
                  <SettingsScreen onDone={() => setLegacyScreen('home')} />
                )}

                {mainTab === 'legacy' && legacyScreen === 'history' && (
                  <PaymentHistoryScreen onDone={() => setLegacyScreen('home')} />
                )}

                <NewAccountToast />
              </View>
            </AccountNotificationsProvider>
          </VenuePhotosProvider>
        </BookingProvider>
      </PlayersProvider>
    </PaymentLogProvider>
  );
}

// Everyone who isn't the owner: players. There is no player login — they
// open the app, pick a court and book. Their phone quietly gets a guest
// session the moment they actually reserve (see ensureGuestSession), so this
// tree is the SAME component whether or not that session exists yet and
// nothing remounts (or loses what they typed) mid-booking.
//
// The only sign-in is the owner's: the "Sign In" button opens AuthScreen on
// top of the booking screen (which stays mounted underneath, so a half-made
// selection survives going there and back) with a clear "owner only" notice.
// This tree never imports or renders HomeScreen, SettingsScreen, or
// PaymentHistoryScreen (the owner-only add-player / log-order / mark-paid
// screens).
function PlayerShell() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <View style={styles.ownerAppRoot}>
      <BookingProvider>
        <VenuePhotosProvider>
          <BookingScreen onOwnerSignIn={() => setShowAuth(true)} />
        </VenuePhotosProvider>
      </BookingProvider>
      {showAuth && (
        <View style={StyleSheet.absoluteFill}>
          <AuthScreen onClose={() => setShowAuth(false)} />
        </View>
      )}
    </View>
  );
}

// Decides what to show based on auth state + role.
function RootRouter() {
  const { session, profile, loading, profileLoading, profileFailed, signOut, refreshProfile } =
    useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  // No session, or just the throwaway guest session a player's booking uses:
  // the public booking view. Nobody here is asked to sign in.
  if (!session || session.user.is_anonymous) {
    return <PlayerShell />;
  }

  // A real account is signed in (only the owner can sign in now), but its
  // role hasn't arrived yet. Wait on a spinner rather than flashing the wrong
  // screen.
  if (!profile) {
    if (profileFailed && !profileLoading) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorTitle}>Couldn't load your account</Text>
          <Text style={styles.errorText}>Please check your connection and try again.</Text>
          <Pressable style={styles.errorBtn} onPress={() => refreshProfile()} accessibilityRole="button">
            <Text style={styles.errorBtnText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.errorLink} onPress={() => signOut()} accessibilityRole="button">
            <Text style={styles.errorLinkText}>Sign out</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return profile.role === 'owner' ? <OwnerApp /> : <PlayerShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" backgroundColor={AppColors.forestGreen} />
        <RootRouter />
        <DialogHost />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.forestGreen },
  ownerAppRoot: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.forestGreen,
  },
  errorTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  errorText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginBottom: 18, textAlign: 'center' },
  errorBtn: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 },
  errorBtnText: { color: AppColors.forestGreen, fontWeight: 'bold', fontSize: 15 },
  errorLink: { marginTop: 14, padding: 8 },
  errorLinkText: { color: '#fff', fontSize: 14, textDecorationLine: 'underline' },
});
