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

import type {
  MainTabParamList,
  RootStackParamList,
} from '../../navigation/types';

import { useAuth } from '../../auth/AuthContext';

type NavigationProp =
  CompositeNavigationProp<
    BottomTabNavigationProp<
      MainTabParamList,
      'Profile'
    >,
    NativeStackNavigationProp<
      RootStackParamList
    >
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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const ProfileScreen = () => {
  const navigation =
    useNavigation<NavigationProp>();

  const {
    user,
    logout,
  } = useAuth();

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Authentication required.
        </Text>
      </View>
    );
  }

  const [
    profile,
    setProfile,
  ] = useState<Profile | null>(null);

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const loadProfile =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/users/${user.id}/profile`,
          );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as Profile;

        setProfile(data);
      } catch (err) {
        console.error(
          'Failed to load profile:',
          err,
        );

        setError(
          'Could not load profile data.',
        );
      } finally {
        setLoading(false);
      }
    }, [user.id]);

  const loadUnreadCount =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            `${API_BASE_URL}/api/users/${user.id}/notifications`,
          );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as
          NotificationsResponse;

        setUnreadCount(
          Number(
            data.unreadCount ?? 0,
          ),
        );
      } catch (err) {
        console.error(
          'Failed to load notification count:',
          err,
        );
      }
    }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadUnreadCount();
    }, [
      loadProfile,
      loadUnreadCount,
    ]),
  );

  const openNotifications =
    () => {
      navigation
        .getParent()
        ?.navigate('Notifications');
    };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#fff"
        />

        <Text style={styles.loadingText}>
          Loading profile...
        </Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.center}>

        <Text style={styles.errorText}>
          {error ??
            'Profile unavailable.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            loadProfile();
            loadUnreadCount();
          }}>
          <Text style={styles.retryText}>
            RETRY
          </Text>
        </TouchableOpacity>

      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={
        styles.contentContainer
      }
      showsVerticalScrollIndicator={false}>

      {/* =========================================
          PROFILE TOP BAR
          ========================================= */}

      <View style={styles.topBar}>

        <Text style={styles.screenTitle}>
          Profile
        </Text>

        <TouchableOpacity
          style={styles.notificationButton}
          activeOpacity={0.8}
          onPress={
            openNotifications
          }>

          <View
            style={
              styles.notificationCircle
            }>

            <Text
              style={
                styles.notificationIcon
              }>
              !
            </Text>

            {unreadCount > 0 && (
              <View
                style={styles.notificationBadge}>

                <Text
                  style={
                    styles.notificationBadgeText
                  }>
                  {unreadCount > 99
                    ? '99+'
                    : unreadCount}
                </Text>

              </View>
            )}

          </View>

        </TouchableOpacity>

      </View>

      {/* =========================================
          PROFILE HEADER
          ========================================= */}

      <View
        style={
          styles.profileHeader
        }>

        <View style={styles.avatar}>

          <Text style={styles.avatarText}>
            {profile.display_name
              .charAt(0)
              .toUpperCase()}
          </Text>

        </View>

        <Text style={styles.name}>
          {profile.display_name}
        </Text>

        <Text style={styles.username}>
          @{profile.username}
        </Text>

        <View style={styles.levelBadge}>

          <Text style={styles.levelText}>
            LEVEL {profile.level}
          </Text>

        </View>

      </View>

      {/* =========================================
          MAIN STATS
          ========================================= */}

      <View style={styles.statsCard}>

        <View style={styles.stat}>

          <Text style={styles.value}>
            {Number(
              profile.territory_km2,
            ).toFixed(3)}
          </Text>

          <Text style={styles.label}>
            TERRITORY KM²
          </Text>

        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>

          <Text style={styles.value}>
            {profile.activities_count}
          </Text>

          <Text style={styles.label}>
            ACTIVITIES
          </Text>

        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>

          <Text style={styles.value}>
            {profile.rank}
          </Text>

          <Text style={styles.label}>
            RANK
          </Text>

        </View>

      </View>

      {/* =========================================
          QUEST STATS
          ========================================= */}

      <View style={styles.section}>

        <Text style={styles.sectionTitle}>
          Quest Stats
        </Text>

        <View style={styles.row}>

          <Text style={styles.rowLabel}>
            Distance
          </Text>

          <Text style={styles.rowValue}>
            {Number(
              profile.total_distance_km,
            ).toFixed(2)}{' '}
            km
          </Text>

        </View>

        <View style={styles.row}>

          <Text style={styles.rowLabel}>
            Territories Captured
          </Text>

          <Text style={styles.rowValue}>
            {profile.territories_captured}
          </Text>

        </View>

        <View style={styles.row}>

          <Text style={styles.rowLabel}>
            Territories Defended
          </Text>

          <Text style={styles.rowValue}>
            {profile.territories_defended}
          </Text>

        </View>

      </View>

      {/* =========================================
          ACTIONS
          ========================================= */}

      <View style={styles.actions}>

        <TouchableOpacity
          style={styles.activityButton}
          onPress={() =>
            navigation
              .getParent()
              ?.navigate(
                'ActivityHistory',
              )
          }>

          <Text
            style={
              styles.activityButtonText
            }>
            VIEW ACTIVITY HISTORY
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.activityButton,
            styles.secondaryButton,
          ]}
          onPress={() =>
            navigation
              .getParent()
              ?.navigate('Clubs')
          }>

          <Text
            style={
              styles.activityButtonText
            }>
            EXPLORE CLUBS
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.activityButton,
            styles.secondaryButton,
          ]}
          onPress={() =>
            navigation
              .getParent()
              ?.navigate(
                'Competitions',
              )
          }>

          <Text
            style={
              styles.activityButtonText
            }>
            EXPLORE COMPETITIONS
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.activityButton,
            styles.secondaryButton
          ]}
          onPress={() =>
            navigation.navigate(
              'Integrations',
            )
          }>
          <Text
            style={
              styles.activityButtonText
            }>
            MANAGE INTEGRATIONS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}>

          <Text style={styles.logoutButtonText}>
            SIGN OUT
          </Text>

        </TouchableOpacity>
      </View>

    </ScrollView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  contentContainer: {
    padding: 20,
    paddingBottom: 110,
  },

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingText: {
    color: '#888',
    marginTop: 12,
  },

  errorText: {
    color: '#aaa',
    textAlign: 'center',
  },

  retryButton: {
    marginTop: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },

  retryText: {
    color: '#000',
    fontWeight: '900',
  },

  /* =========================================
     TOP BAR
     ========================================= */

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  screenTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  notificationButton: {
    padding: 2,
  },

  notificationCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  notificationIcon: {
    color: '#fff',
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
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },

  notificationBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },

  /* =========================================
     PROFILE
     ========================================= */

  profileHeader: {
    alignItems: 'center',
    marginTop: 10,
  },

  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 34,
    fontWeight: '900',
  },

  name: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 12,
  },

  username: {
    color: '#666',
    marginTop: 3,
  },

  levelBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111',
    borderRadius: 10,
  },

  levelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  /* =========================================
     STATS
     ========================================= */

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 20,
    marginTop: 22,
    paddingVertical: 22,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
  },

  label: {
    color: '#666',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  /* =========================================
     QUEST STATS
     ========================================= */

  section: {
    marginTop: 25,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 12,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },

  rowLabel: {
    color: '#777',
  },

  rowValue: {
    color: '#fff',
    fontWeight: '700',
  },

  /* =========================================
     ACTIONS
     ========================================= */

  actions: {
    marginTop: 'auto',
  },

  activityButton: {
    backgroundColor: '#fff',
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionStack: {
    marginTop: 28,
    gap: 12,
    paddingBottom: 10,
  },

  secondaryButton: {
    marginTop: 10,
  },

  activityButtonText: {
    color: '#000',
    fontWeight: '900',
  },

  logoutButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  logoutButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
});