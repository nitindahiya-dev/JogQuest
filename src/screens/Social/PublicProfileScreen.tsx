import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Route =
  RouteProp<
    RootStackParamList,
    'PublicProfile'
  >;

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'PublicProfile'
  >;

type SocialProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;

  activities_count: number;
  total_distance_km: number;

  territories_captured: number;
  territory_km2: number;
  territories_defended: number;

  followers_count: number;
  following_count: number;

  rank: number;
  level: number;

  followed_by_viewer: boolean;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const PublicProfileScreen = () => {
  const route =
    useRoute<Route>();

  const navigation =
    useNavigation<Navigation>();

  const {
    userId,
  } = route.params;

  const [
    profile,
    setProfile,
  ] = useState<
    SocialProfile | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    followLoading,
    setFollowLoading,
  ] = useState(false);

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
            `${API_BASE_URL}/api/users/${userId}/social-profile?viewerId=${DEV_USER_ID}`,
          );

        const data =
          (await response.json()) as
            | SocialProfile
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data &&
            data.error
              ? data.error
              : 'Failed to load profile',
          );
        }

        setProfile(
          data as SocialProfile,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load profile',
        );
      } finally {
        setLoading(false);
      }
    }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const toggleFollow =
    async () => {
      if (
        !profile ||
        profile.id === DEV_USER_ID ||
        followLoading
      ) {
        return;
      }

      try {
        setFollowLoading(true);

        const method =
          profile.followed_by_viewer
            ? 'DELETE'
            : 'POST';

        const response =
          await fetch(
            `${API_BASE_URL}/api/users/${DEV_USER_ID}/follow/${profile.id}`,
            {
              method,
            },
          );

        const data =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Failed to update follow',
          );
        }

        setProfile(
          current =>
            current
              ? {
                  ...current,

                  followed_by_viewer:
                    !current.followed_by_viewer,

                  followers_count:
                    current.followed_by_viewer
                      ? Math.max(
                          current.followers_count - 1,
                          0,
                        )
                      : current.followers_count + 1,
                }
              : current,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to update follow',
        );
      } finally {
        setFollowLoading(false);
      }
    };

  const openFollowers =
    () => {
      navigation.navigate(
        'FollowList',
        {
          userId: userId,
          mode: 'followers',
        },
      );
    };

  const openFollowing =
    () => {
      navigation.navigate(
        'FollowList',
        {
          userId: userId,
          mode: 'following',
        },
      );
    };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#fff"
        />
      </View>
    );
  }

  if (
    error ||
    !profile
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ??
            'Profile unavailable.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadProfile}>
          <Text style={styles.retryText}>
            RETRY
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwnProfile =
    profile.id === DEV_USER_ID;

  return (
    <View style={styles.container}>

      <View style={styles.header}>

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

      {!isOwnProfile && (
        <TouchableOpacity
          style={
            profile.followed_by_viewer
              ? styles.followButtonFollowing
              : styles.followButton
          }
          onPress={toggleFollow}
          disabled={followLoading}>

          {followLoading ? (
            <ActivityIndicator
              size="small"
              color={
                profile.followed_by_viewer
                  ? '#fff'
                  : '#000'
              }
            />
          ) : (
            <Text
              style={
                profile.followed_by_viewer
                  ? styles.followingText
                  : styles.followText
              }>
              {profile.followed_by_viewer
                ? 'FOLLOWING'
                : 'FOLLOW'}
            </Text>
          )}

        </TouchableOpacity>
      )}

      <View style={styles.socialStats}>

        <TouchableOpacity
          style={styles.socialStat}
          onPress={openFollowers}>

          <Text style={styles.socialValue}>
            {profile.followers_count}
          </Text>

          <Text style={styles.socialLabel}>
            FOLLOWERS
          </Text>

        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.socialStat}
          onPress={openFollowing}>

          <Text style={styles.socialValue}>
            {profile.following_count}
          </Text>

          <Text style={styles.socialLabel}>
            FOLLOWING
          </Text>

        </TouchableOpacity>

      </View>

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

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
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

  header: {
    alignItems: 'center',
    marginTop: 12,
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
    fontSize: 25,
    fontWeight: '900',
    marginTop: 12,
  },

  username: {
    color: '#666',
    marginTop: 3,
  },

  levelBadge: {
    marginTop: 10,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  levelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  followButton: {
    height: 44,
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  followButtonFollowing: {
    height: 44,
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  followText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },

  followingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  socialStats: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 18,
    marginTop: 18,
    paddingVertical: 18,
  },

  socialStat: {
    flex: 1,
    alignItems: 'center',
  },

  socialValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  socialLabel: {
    color: '#666',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 5,
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 18,
    marginTop: 12,
    paddingVertical: 20,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  label: {
    color: '#666',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  section: {
    marginTop: 22,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },

  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1d1d1d',
  },

  rowLabel: {
    color: '#777',
    fontSize: 13,
  },

  rowValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default PublicProfileScreen;
