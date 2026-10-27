import { API_BASE_URL } from '../../config/api';
import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Route = RouteProp<RootStackParamList, 'ClubDetails'>;
type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'ClubDetails'
>;

type Club = {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  is_public: boolean;
  created_at: string;
  creator_username: string;
  creator_display_name: string;
  members_count: number;
};

type ClubJoinRequest = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
};

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
};



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

const ClubDetailsScreen = () => {
  const { user, token } = useAuth();
  const userId = user?.id;

  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const { clubId } = route.params;

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [joined, setJoined] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClub = useCallback(async () => {
    if (!userId) {
      setError('Please log in to view membership.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const [
        clubResponse,
        membersResponse,
        membershipResponse,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/clubs/${clubId}`),
        fetch(`${API_BASE_URL}/api/clubs/${clubId}/members`),
        fetch(
          `${API_BASE_URL}/api/clubs/${clubId}/membership/${userId}`,
        ),
      ]);

      const clubData = (await clubResponse.json()) as
        | Club
        | { error?: string };

      const membersData = (await membersResponse.json()) as
        | Member[]
        | { error?: string };

      const membershipData = (await membershipResponse.json()) as {
        joined?: boolean;
        error?: string;
      };

      if (!clubResponse.ok) {
        throw new Error(
          'error' in clubData && clubData.error
            ? clubData.error
            : 'Failed to load club',
        );
      }

      if (!membersResponse.ok) {
        throw new Error(
          'error' in membersData && membersData.error
            ? membersData.error
            : 'Failed to load members',
        );
      }

      if (!membershipResponse.ok) {
        throw new Error(
          membershipData.error ?? 'Failed to load membership',
        );
      }

      const loadedClub = clubData as Club;
      setClub(loadedClub);
      setMembers(membersData as Member[]);
      setJoined(membershipData.joined ?? false);

      if (!loadedClub.is_public && token && userId) {
        if (loadedClub.creator_id === userId) {
          const requestsResponse = await fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/requests`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const requestData = await requestsResponse.json();
          if (requestsResponse.ok && Array.isArray(requestData)) {
            setJoinRequests(requestData as ClubJoinRequest[]);
          }
        } else {
          const requestResponse = await fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/requests/me`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const requestData = (await requestResponse.json()) as {
            status?: string | null;
            error?: string;
          };
          if (requestResponse.ok) {
            setRequestStatus(requestData.status ?? null);
          }
        }
      } else {
        setRequestStatus(null);
        setJoinRequests([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load club',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubId, userId, token]);

  useFocusEffect(
    useCallback(() => {
      loadClub();
    }, [loadClub]),
  );

  const toggleMembership = async () => {
    if (!userId || !club || actionLoading) return;

    const isOwner = club.creator_id === userId;
    if (joined && isOwner) return;

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/join/${userId}`,
        {
          method: joined ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = (await response.json()) as {
        joined?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Failed to update membership',
        );
      }

      await loadClub();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update membership',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const submitJoinRequest = async () => {
    if (!club || !token || actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/requests`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'Could not request to join');
      setRequestStatus(data.status ?? 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request to join');
    } finally {
      setActionLoading(false);
    }
  };

  const reviewJoinRequest = async (
    requestId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!club || !token || actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not review request');
      await loadClub();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review request');
    } finally {
      setActionLoading(false);
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
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!club) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text style={styles.errorText}>
          {error ?? 'Club unavailable.'}
        </Text>
      </View>
    );
  }

  const isOwner = !!userId && club.creator_id === userId;

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadClub();
            }}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 40 },
        ]}
        ListHeaderComponent={
          <View>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Text style={styles.heroIconText}>
                  {club.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              <Text style={styles.heroName}>{club.name}</Text>

              <Text style={styles.heroDescription}>
                {club.description || 'No description'}
              </Text>

              <Text style={styles.heroCreator}>
                Created by{' '}
                <Text style={{ color: COLORS.accent }}>
                  @{club.creator_username}
                </Text>
              </Text>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Membership / private join request */}
            {!isOwner && (club.is_public || joined) && (
              <TouchableOpacity
                style={[styles.actionBtn, joined && styles.actionBtnLeave]}
                onPress={toggleMembership}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator color={joined ? COLORS.text : COLORS.background} />
                ) : (
                  <Text style={[styles.actionBtnText, joined && styles.actionBtnTextLeave]}>
                    {joined ? 'LEAVE CLUB' : 'JOIN CLUB'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {!isOwner && !club.is_public && !joined && (
              <TouchableOpacity
                style={[styles.actionBtn, requestStatus === 'pending' && styles.actionBtnLeave]}
                onPress={submitJoinRequest}
                disabled={actionLoading || requestStatus === 'pending'}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.actionBtnText}>
                    {requestStatus === 'pending'
                      ? 'REQUEST PENDING'
                      : requestStatus === 'rejected'
                        ? 'REQUEST AGAIN'
                        : 'REQUEST TO JOIN'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {isOwner && (
              <View style={styles.ownerBanner}>
                <Text style={styles.ownerBannerText}>
                  ⚡ YOU ARE THE OWNER
                </Text>
              </View>
            )}

            {!club.is_public && isOwner && (
              <View style={styles.requestsPanel}>
                <Text style={styles.sectionTitle}>PENDING JOIN REQUESTS</Text>
                {joinRequests.length === 0 ? (
                  <Text style={styles.emptyText}>No pending requests.</Text>
                ) : joinRequests.map(request => (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>
                        {request.display_name || request.username}
                      </Text>
                      <Text style={styles.memberUsername}>@{request.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.approveButton}
                      disabled={actionLoading}
                      onPress={() => reviewJoinRequest(request.id, 'approved')}
                    >
                      <Text style={styles.reviewButtonText}>APPROVE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      disabled={actionLoading}
                      onPress={() => reviewJoinRequest(request.id, 'rejected')}
                    >
                      <Text style={styles.reviewButtonText}>REJECT</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {club.members_count}
                </Text>
                <Text style={styles.statLabel}>MEMBERS</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {club.is_public ? 'PUBLIC' : 'PRIVATE'}
                </Text>
                <Text style={styles.statLabel}>VISIBILITY</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>MEMBERS</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberCard}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('PublicProfile', {
                userId: item.id,
              })
            }
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.memberName}>
                {item.display_name}
              </Text>
              <Text style={styles.memberUsername}>
                @{item.username}
              </Text>
            </View>

            {item.id === club.creator_id && (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeText}>OWNER</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No members yet.</Text>
        }
      />
    </View>
  );
};

export default ClubDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  list: {
    padding: SPACING.md,
  },

  // Hero
  hero: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },

  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroIconText: {
    color: COLORS.background,
    fontSize: 36,
    fontWeight: '900',
  },

  heroName: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },

  heroDescription: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },

  heroCreator: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 12,
  },

  // Actions
  actionBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 14,
  },

  actionBtnLeave: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },

  actionBtnText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  actionBtnTextLeave: {
    color: COLORS.danger,
  },

  ownerBanner: {
    backgroundColor: 'rgba(212, 255, 0, 0.10)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 14,
  },

  ownerBannerText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
  },

  requestsPanel: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  approveButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
  },
  rejectButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  reviewButtonText: {
    color: COLORS.background,
    fontSize: 9,
    fontWeight: '900',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingVertical: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statBox: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '900',
  },

  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.4,
  },

  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  sectionTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 26,
    marginBottom: 12,
  },

  // Members
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: COLORS.background,
    fontSize: 17,
    fontWeight: '900',
  },

  memberName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },

  memberUsername: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  ownerBadge: {
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  ownerBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
  },

  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
    fontSize: 13,
  },

  errorBox: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});