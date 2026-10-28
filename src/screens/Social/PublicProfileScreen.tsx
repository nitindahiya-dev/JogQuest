import { API_BASE_URL } from '../../config/api';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';



const PublicProfileScreen = () => {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();

  const viewerId = user?.id;
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(Date.now());
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!viewerId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/social-profile?viewerId=${viewerId}`,
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load');
      }

      setAvatarLoadFailed(false);
      setAvatarRefreshKey(Date.now());
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [userId, viewerId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const startMessage = async () => {
    if (!token || !profile?.id || profile.id === viewerId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: profile.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; conversationId?: string };

      if (!response.ok || !data.conversationId) {
        throw new Error(data.error || 'Could not open conversation.');
      }

      navigation.navigate('Chat', {
        conversationId: data.conversationId,
        otherUserId: profile.id,
        otherUsername: profile.username || '',
        otherDisplayName: profile.display_name || profile.username || 'Runner',
        otherAvatarUrl: profile.avatar_url || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open conversation.');
    }
  };

  const toggleFollow = async () => {
    if (!viewerId || !profile || profile.id === viewerId || followLoading) {
      return;
    }

    try {
      setFollowLoading(true);

      const method = profile.followed_by_viewer ? 'DELETE' : 'POST';
      const response = await fetch(
        `${API_BASE_URL}/api/users/${viewerId}/follow/${profile.id}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result = (await response.json().catch(() => ({}))) as {error?: string};

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update follow status.');
      }

      // The API is the source of truth for follow status and counts.
      const profileResponse = await fetch(
        `${API_BASE_URL}/api/users/${profile.id}/social-profile?viewerId=${viewerId}`,
      );
      const updatedProfile = (await profileResponse.json()) as any;

      if (!profileResponse.ok) {
        throw new Error(
          updatedProfile.error || 'Follow updated, but profile refresh failed.',
        );
      }

      setProfile(updatedProfile);
    } catch (e) {
      console.error('Failed to update follow status:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text style={styles.errorText}>
          {error || 'Unavailable'}
        </Text>
      </View>
    );
  }

  const isOwnProfile = viewerId === profile.id;
  const avatarUri =
    profile.avatar_url && !avatarLoadFailed
      ? `${profile.avatar_url}${profile.avatar_url.includes('?') ? '&' : '?'}v=${avatarRefreshKey}`
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 40,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          {avatarUri ? (
            <Image
              key={avatarUri}
              source={{uri: avatarUri}}
              style={styles.avatarImage}
              onError={() => setAvatarLoadFailed(true)}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.avatarText}>
              {profile.display_name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          )}
        </View>

        <Text style={styles.name}>{profile.display_name}</Text>

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
          style={styles.messageBtn}
          onPress={startMessage}
          activeOpacity={0.8}
        >
          <Text style={styles.messageBtnText}>MESSAGE</Text>
        </TouchableOpacity>
      )}

      {!isOwnProfile && (
        <TouchableOpacity
          style={[
            styles.followBtn,
            profile.followed_by_viewer && styles.followBtnFollowing,
          ]}
          onPress={toggleFollow}
          disabled={followLoading}
          activeOpacity={0.8}
        >
          {followLoading ? (
            <ActivityIndicator
              color={
                profile.followed_by_viewer
                  ? COLORS.text
                  : COLORS.background
              }
            />
          ) : (
            <Text
              style={[
                styles.followBtnText,
                profile.followed_by_viewer &&
                  styles.followBtnTextFollowing,
              ]}
            >
              {profile.followed_by_viewer ? 'FOLLOWING' : '+ FOLLOW'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.socialStats}>
        <TouchableOpacity
          style={styles.socialStat}
          onPress={() =>
            navigation.navigate('FollowList', {
              userId,
              mode: 'followers',
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.socialValue}>
            {profile.followers_count}
          </Text>

          <Text style={styles.socialLabel}>FOLLOWERS</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.socialStat}
          onPress={() =>
            navigation.navigate('FollowList', {
              userId,
              mode: 'following',
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.socialValue}>
            {profile.following_count}
          </Text>

          <Text style={styles.socialLabel}>FOLLOWING</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.value}>
            {Number(profile.territory_km2).toFixed(3)}
          </Text>
          <Text style={styles.label}>KM²</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>
            {profile.activities_count}
          </Text>
          <Text style={styles.label}>ACTIVITIES</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>#{profile.rank}</Text>
          <Text style={styles.label}>RANK</Text>
        </View>
      </View>

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

        <View style={[styles.row, styles.lastRow]}>
          <Text style={styles.rowLabel}>Territories Defended</Text>
          <Text style={styles.rowValue}>
            {profile.territories_defended}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.md,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },

  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.danger,
  },

  profileHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  avatarText: {
    color: COLORS.background,
    fontSize: 40,
    fontWeight: '900',
  },

  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },

  name: {
    ...TYPOGRAPHY.h1,
    fontSize: 26,
  },

  username: {
    ...TYPOGRAPHY.body,
    marginTop: 4,
  },

  levelBadge: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  levelText: {
    ...TYPOGRAPHY.label,
    color: COLORS.accent,
  },

  messageBtn: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.lg,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  messageBtnText: {
    ...TYPOGRAPHY.label,
    color: COLORS.accent,
    fontSize: 13,
  },

  followBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  followBtnFollowing: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },

  followBtnText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontSize: 13,
  },

  followBtnTextFollowing: {
    color: COLORS.text,
  },

  socialStats: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  socialStat: {
    flex: 1,
    alignItems: 'center',
  },

  socialValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 22,
  },

  socialLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    marginTop: 4,
  },

  divider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    ...TYPOGRAPHY.h3,
    fontSize: 16,
    color: COLORS.accent,
  },

  label: {
    ...TYPOGRAPHY.label,
    fontSize: 8,
    marginTop: 4,
  },

  sectionTitle: {
    ...TYPOGRAPHY.label,
    fontSize: 11,
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },

  listCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  rowLabel: {
    ...TYPOGRAPHY.body,
    fontSize: 15,
    flexShrink: 1,
  },

  rowValue: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
    color: COLORS.accent,
    flexShrink: 0, 
    textAlign: 'right',
  },
});

export default PublicProfileScreen;