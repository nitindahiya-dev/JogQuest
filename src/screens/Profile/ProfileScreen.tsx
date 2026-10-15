import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import type {
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import type {
  CompositeNavigationProp,
} from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {
  MainTabParamList,
  RootStackParamList,
} from '../../navigation/types';

import {useAuth} from '../../auth/AuthContext';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  activities_count: number;
  total_distance_km: number;
  territories_captured: number;
  territory_km2: number;
  territories_defended: number;
  rank: number;
  level: number;
};

type NotificationsResponse = {
  unreadCount: number;
};

const API_BASE_URL = 'http://127.0.0.1:4000';

// ─── Design tokens ───
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.95)',
  surfaceLight: '#171717',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
  danger: '#FF4D4D',
};

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
};

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user, token, logout} = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Authentication required.</Text>
      </View>
    );
  }

  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${user.id}/profile`,
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as Profile;
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Could not load profile data.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${user.id}/notifications`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) return;

      const data = (await response.json()) as NotificationsResponse;
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch (err) {
      console.error('Failed to load notification count:', err);
    }
  }, [user.id, token]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadUnreadCount();
    }, [loadProfile, loadUnreadCount]),
  );

  const openNotifications = () => {
    navigation.getParent()?.navigate('Notifications');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ?? 'Profile unavailable.'}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            loadProfile();
            loadUnreadCount();
          }}>
          <Text style={styles.retryText}>RETRY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>PROFILE</Text>

        <TouchableOpacity
          style={styles.notificationButton}
          activeOpacity={0.8}
          onPress={openNotifications}>
          <View style={styles.notificationCircle}>
            <Text style={styles.notificationIcon}>!</Text>
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.display_name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>

        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>LEVEL {profile.level}</Text>
        </View>
      </View>

      {/* Main Stats */}
      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.value}>
            {Number(profile.territory_km2).toFixed(3)}
          </Text>
          <Text style={styles.label}>TERRITORY KM²</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>{profile.activities_count}</Text>
          <Text style={styles.label}>ACTIVITIES</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>#{profile.rank}</Text>
          <Text style={styles.label}>RANK</Text>
        </View>
      </View>

      {/* Quest Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QUEST STATS</Text>

        <View style={styles.listCard}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Distance</Text>
            <Text style={styles.rowValue}>
              {Number(profile.total_distance_km).toFixed(2)} km
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Territories Captured</Text>
            <Text style={styles.rowValue}>
              {profile.territories_captured}
            </Text>
          </View>

          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Territories Defended</Text>
            <Text style={styles.rowValue}>
              {profile.territories_defended}
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={() =>
            navigation.getParent()?.navigate('ActivityHistory')
          }>
          <Text style={styles.primaryButtonText}>
            VIEW ACTIVITY HISTORY
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.getParent()?.navigate('Clubs')}>
          <Text style={styles.secondaryButtonText}>EXPLORE CLUBS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() =>
            navigation.getParent()?.navigate('Competitions')
          }>
          <Text style={styles.secondaryButtonText}>
            EXPLORE COMPETITIONS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Integrations')}>
          <Text style={styles.secondaryButtonText}>
            MANAGE INTEGRATIONS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={logout}>
          <Text style={styles.logoutButtonText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingHorizontal: SPACING.md,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 15,
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: COLORS.background,
    fontWeight: '900',
    fontSize: 13,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  notificationButton: {
    padding: 2,
  },
  notificationCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationIcon: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },
  notificationBadge: {
    position: 'absolute',
    right: -4,
    top: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    borderWidth: 2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: COLORS.background,
    fontSize: 9,
    fontWeight: '900',
  },

  profileHeader: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.background,
    fontSize: 38,
    fontWeight: '900',
  },
  name: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 14,
  },
  username: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 3,
  },
  levelBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  levelText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    marginTop: 22,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 12,
  },
  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  rowValue: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '800',
  },

  actions: {
    marginTop: 28,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: COLORS.background,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 13,
  },
  logoutButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  logoutButtonText: {
    color: COLORS.danger,
    fontWeight: '900',
    fontSize: 13,
  },
});