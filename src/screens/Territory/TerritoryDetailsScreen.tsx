import React, { useCallback, useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useJogQuestAlert } from '../../components/JogQuestAlert';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';

type TerritoryDetailsRouteProp = RouteProp<
  RootStackParamList,
  'TerritoryDetails'
>;

type TerritoryDetails = {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  area_m2: number;
  area_km2: number;
  captured_at: string;
  owner_username: string;
  owner_display_name: string;
  distance_km: number | null;
  elapsed_seconds: number | null;
  pace: string | null;
  latest_action: string | null;
  status: string;
};

type TerritoryChallenge = {
  id: string;
  territory_id: string;
  activity_id: string;
  challenger_id: string;
  overlap_area_m2: number;
  overlap_ratio: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
  resolved_at: string | null;
  challenger_username: string;
  challenger_display_name: string;
};

type TerritoryHistoryItem = {
  id: string;
  territory_id: string;
  action: 'CAPTURED' | 'CHALLENGE_REJECTED' | 'TRANSFERRED';
  previous_owner_id: string | null;
  previous_owner_username: string | null;
  previous_owner_display_name: string | null;
  new_owner_id: string | null;
  new_owner_username: string | null;
  new_owner_display_name: string | null;
  created_at: string;
};

type Activity = {
  id: string;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  distance_km: number;
  elapsed_seconds: number;
  pace: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type ActivityRoutePoint = {
  sequence_number: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
};

const API_BASE_URL = 'http://127.0.0.1:4000';

const COLORS = {
  background: '#0A0A0A',
  surface: '#121212',
  surfaceLight: '#191919',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#717171',
  border: 'rgba(255,255,255,0.10)',
  danger: '#FF5A5A',
  success: '#6EE7A0',
  warning: '#FFC66D',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDistance = (value: number | null | undefined) =>
  `${Number(value ?? 0).toFixed(2)} km`;

const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return COLORS.warning;
    case 'ACCEPTED':
    case 'ACTIVE':
      return COLORS.success;
    case 'REJECTED':
    case 'INACTIVE':
      return COLORS.danger;
    default:
      return COLORS.textSecondary;
  }
};

const getHistoryText = (item: TerritoryHistoryItem) => {
  switch (item.action) {
    case 'CAPTURED':
      return {
        title: 'Territory captured',
        description: item.new_owner_display_name
          ? `${item.new_owner_display_name} captured this territory.`
          : 'This territory was captured.',
      };

    case 'CHALLENGE_REJECTED':
      return {
        title: 'Challenge rejected',
        description: item.new_owner_display_name
          ? `${item.new_owner_display_name} retained ownership.`
          : 'The challenge was rejected.',
      };

    case 'TRANSFERRED':
      return {
        title: 'Ownership transferred',
        description:
          item.previous_owner_display_name &&
            item.new_owner_display_name
            ? `${item.previous_owner_display_name} → ${item.new_owner_display_name}`
            : 'Territory ownership changed.',
      };

    default:
      return {
        title: 'Territory updated',
        description: 'A territory event was recorded.',
      };
  }
};

const TerritoryDetailsScreen = () => {
  const { user, token } = useAuth();
  const alert = useJogQuestAlert();
  const userId = user?.id;
  const route = useRoute<TerritoryDetailsRouteProp>();
  const { territoryId } = route.params;
  const insets = useSafeAreaInsets();

  const [territory, setTerritory] =
    useState<TerritoryDetails | null>(null);
  const [challenges, setChallenges] =
    useState<TerritoryChallenge[]>([]);
  const [history, setHistory] =
    useState<TerritoryHistoryItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);
  const [selectedActivityId, setSelectedActivityId] =
    useState<string | null>(null);
  const [challengeModalVisible, setChallengeModalVisible] =
    useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTerritory = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/territories/${territoryId}`,
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as TerritoryDetails;
      setTerritory(data);
    } catch (err) {
      console.error('Failed to load territory:', err);
      setError('Could not load territory details.');
    } finally {
      setLoading(false);
    }
  }, [territoryId]);

  const loadChallenges = useCallback(async () => {
    try {
      setChallengeLoading(true);

      const response = await fetch(
        `${API_BASE_URL}/api/territories/${territoryId}/challenges`,
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as TerritoryChallenge[];
      setChallenges(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load challenges:', err);
    } finally {
      setChallengeLoading(false);
    }
  }, [territoryId]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/territories/${territoryId}/history`,
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as TerritoryHistoryItem[];
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load territory history:', err);
    }
  }, [territoryId]);

  const loadActivities = useCallback(async () => {
    if (!userId) {
      setActivities([]);
      setActivityLoading(false);
      return;
    }

    try {
      setActivityLoading(true);

      const response = await fetch(
        `${API_BASE_URL}/api/activities/${userId}`,
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as Activity[];
      setActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load activities:', err);
      alert('Unable to load activities', 'Please try again.');
    } finally {
      setActivityLoading(false);
    }
  }, [userId]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        loadTerritory(),
        loadChallenges(),
        loadHistory(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadTerritory, loadChallenges, loadHistory]);

  useEffect(() => {
    loadTerritory();
    loadChallenges();
    loadHistory();
  }, [loadTerritory, loadChallenges, loadHistory]);

  const openChallengeModal = async () => {
    setSelectedActivityId(null);
    setChallengeModalVisible(true);
    await loadActivities();
  };

  const closeChallengeModal = () => {
    if (!submittingChallenge) {
      setChallengeModalVisible(false);
    }
  };

  const submitChallenge = async () => {
    if (!userId || !selectedActivityId || submittingChallenge) return;

    try {
      setSubmittingChallenge(true);

      const routeResponse = await fetch(
        `${API_BASE_URL}/api/activities/${selectedActivityId}/route`,
      );

      const routeData = (await routeResponse.json()) as {
        activity?: Activity;
        route?: ActivityRoutePoint[];
        error?: string;
      };

      if (!routeResponse.ok) {
        throw new Error(
          routeData.error ?? `Server returned ${routeResponse.status}`,
        );
      }

      const polygon =
        routeData.route?.map(point => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
        })) ?? [];

      if (polygon.length < 4) {
        throw new Error(
          'Selected activity does not contain enough GPS points.',
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/api/territories/${territoryId}/challenges`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            challengerId: userId,
            activityId: selectedActivityId,
            polygon,
          }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          data.error ?? `Server returned ${response.status}`,
        );
      }

      setChallengeModalVisible(false);
      setSelectedActivityId(null);

      await Promise.all([loadChallenges(), loadHistory()]);

      alert(
        'Challenge submitted',
        'Your territory challenge has been submitted.',
      );
    } catch (err) {
      console.error('Failed to submit challenge:', err);

      alert(
        'Challenge failed',
        err instanceof Error
          ? err.message
          : 'Unable to submit your challenge.',
      );
    } finally {
      setSubmittingChallenge(false);
    }
  };

  const resolveChallenge = async (
    challengeId: string,
    decision: 'ACCEPT' | 'REJECT',
  ) => {
    if (!userId || resolvingId) return;

    const actionLabel = decision === 'ACCEPT' ? 'accept' : 'reject';

    alert(
      `${decision === 'ACCEPT' ? 'Accept' : 'Reject'} challenge?`,
      `Are you sure you want to ${actionLabel} this territory challenge?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: decision,
          style: decision === 'REJECT' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setResolvingId(challengeId);

              const response = await fetch(
                `${API_BASE_URL}/api/territories/${territoryId}/challenges/${challengeId}/resolve`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    resolverId: userId,
                    decision,
                  }),
                },
              );

              const data = (await response.json()) as {
                error?: string;
              };

              if (!response.ok) {
                throw new Error(
                  data.error ?? `Server returned ${response.status}`,
                );
              }

              await Promise.all([
                loadTerritory(),
                loadChallenges(),
                loadHistory(),
              ]);
            } catch (err) {
              console.error('Failed to resolve challenge:', err);

              alert(
                'Action failed',
                err instanceof Error
                  ? err.message
                  : 'Unable to update this challenge.',
              );
            } finally {
              setResolvingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingIcon}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
        <Text style={styles.loadingTitle}>Loading territory</Text>
        <Text style={styles.loadingSubtitle}>
          Retrieving territory details...
        </Text>
      </View>
    );
  }

  if (error || !territory) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>

        <Text style={styles.errorTitle}>Territory unavailable</Text>
        <Text style={styles.errorDescription}>
          {error ?? 'This territory could not be found.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadTerritory}
          activeOpacity={0.85}
        >
          <Text style={styles.retryText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = !!userId && territory.user_id === userId;

  const hasPendingOwnChallenge =
    !!userId &&
    challenges.some(
      challenge =>
        challenge.challenger_id === userId &&
        challenge.status === 'PENDING',
    );

  const pendingCount = challenges.filter(
    challenge => challenge.status === 'PENDING',
  ).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>TERRITORY / DETAILS</Text>
          </View>

          <Text style={styles.pageTitle}>
            CLAIM YOUR{'\n'}
            <Text style={styles.pageTitleAccent}>GROUND.</Text>
          </Text>

          <Text style={styles.pageSubtitle}>
            Explore the territory, review challenges, and see its history.
          </Text>
        </View>

        {/* Area hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>TERRITORY AREA</Text>
              <View style={styles.areaRow}>
                <Text style={styles.heroValue}>
                  {Number(territory.area_km2).toFixed(3)}
                </Text>
                <Text style={styles.heroUnit}>KM²</Text>
              </View>
            </View>

            <View style={styles.heroIcon}>
              <Text style={styles.heroIconText}>⌖</Text>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.ownerRow}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerAvatarText}>
                {(territory.owner_display_name || territory.owner_username)
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.ownerInfo}>
              <Text style={styles.ownerLabel}>CURRENT OWNER</Text>
              <Text style={styles.ownerName} numberOfLines={1}>
                {territory.owner_display_name || territory.owner_username}
              </Text>
              <Text style={styles.ownerUsername}>
                @{territory.owner_username}
              </Text>
            </View>

            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>
                {isOwner ? 'YOU' : 'OWNER'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>TERRITORY OVERVIEW</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ACTIVITY</Text>
            <Text style={styles.statValue}>
              {territory.activity_type}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>STATUS</Text>
            <View style={styles.statusValueRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(territory.status) },
                ]}
              />
              <Text style={styles.statValue} numberOfLines={1}>
                {territory.status}
              </Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DISTANCE</Text>
            <Text style={styles.statValue}>
              {formatDistance(territory.distance_km)}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>CAPTURED</Text>
            <Text style={styles.statValue}>
              {formatDate(territory.captured_at)}
            </Text>
          </View>
        </View>

        {/* Challenge action */}
        {!isOwner && !hasPendingOwnChallenge && (
          <TouchableOpacity
            style={styles.challengeButton}
            onPress={openChallengeModal}
            activeOpacity={0.85}
          >
            <View style={styles.challengeButtonIcon}>
              <Text style={styles.challengeButtonIconText}>⚔</Text>
            </View>

            <View style={styles.challengeButtonContent}>
              <Text style={styles.challengeButtonTitle}>
                CHALLENGE TERRITORY
              </Text>
              <Text style={styles.challengeButtonSubtitle}>
                Submit an activity to challenge ownership
              </Text>
            </View>

            <Text style={styles.challengeButtonArrow}>↗</Text>
          </TouchableOpacity>
        )}

        {!isOwner && hasPendingOwnChallenge && (
          <View style={styles.pendingNotice}>
            <View style={styles.pendingNoticeIcon}>
              <Text style={styles.pendingNoticeIconText}>◷</Text>
            </View>

            <View style={styles.pendingNoticeContent}>
              <Text style={styles.pendingNoticeTitle}>
                Challenge pending
              </Text>
              <Text style={styles.pendingNoticeDescription}>
                Your challenge is awaiting a decision from the owner.
              </Text>
            </View>
          </View>
        )}

        {/* Challenges */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>CHALLENGES</Text>
              <Text style={styles.sectionSubtitle}>
                Territory ownership disputes
              </Text>
            </View>

            <View style={styles.sectionCount}>
              {challengeLoading ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <Text style={styles.sectionCountText}>
                  {challenges.length}
                </Text>
              )}
            </View>
          </View>

          {challenges.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>⚔</Text>
              </View>
              <Text style={styles.emptyTitle}>No challenges yet</Text>
              <Text style={styles.emptyDescription}>
                This territory has no recorded challenges.
              </Text>
            </View>
          ) : (
            challenges.map(challenge => {
              const isPending = challenge.status === 'PENDING';
              const isResolving = resolvingId === challenge.id;

              return (
                <View key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.challengeTop}>
                    <View style={styles.challengeUser}>
                      <View style={styles.challengeAvatar}>
                        <Text style={styles.challengeAvatarText}>
                          {(challenge.challenger_display_name ||
                            challenge.challenger_username)
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.challengeUserInfo}>
                        <Text style={styles.challengeName} numberOfLines={1}>
                          {challenge.challenger_display_name}
                        </Text>
                        <Text style={styles.challengeUsername}>
                          @{challenge.challenger_username}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            challenge.status === 'PENDING'
                              ? 'rgba(255,198,109,0.12)'
                              : challenge.status === 'ACCEPTED'
                                ? 'rgba(110,231,160,0.12)'
                                : 'rgba(255,90,90,0.12)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: getStatusColor(challenge.status) },
                        ]}
                      >
                        {challenge.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.challengeStats}>
                    <View style={styles.challengeStat}>
                      <Text style={styles.challengeStatLabel}>
                        OVERLAP
                      </Text>
                      <Text style={styles.challengeStatValue}>
                        {(
                          Number(challenge.overlap_ratio) * 100
                        ).toFixed(1)}%
                      </Text>
                    </View>

                    <View style={styles.challengeStatDivider} />

                    <View style={styles.challengeStat}>
                      <Text style={styles.challengeStatLabel}>
                        OVERLAP AREA
                      </Text>
                      <Text style={styles.challengeStatValue}>
                        {(
                          Number(challenge.overlap_area_m2) / 1_000_000
                        ).toFixed(3)}{' '}
                        km²
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.challengeDate}>
                    Submitted {formatDate(challenge.created_at)}
                  </Text>

                  {isOwner && isPending && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        disabled={Boolean(resolvingId)}
                        onPress={() =>
                          resolveChallenge(challenge.id, 'REJECT')
                        }
                        activeOpacity={0.8}
                      >
                        <Text style={styles.rejectButtonText}>REJECT</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.acceptButton}
                        disabled={Boolean(resolvingId)}
                        onPress={() =>
                          resolveChallenge(challenge.id, 'ACCEPT')
                        }
                        activeOpacity={0.8}
                      >
                        {isResolving ? (
                          <ActivityIndicator
                            color={COLORS.background}
                            size="small"
                          />
                        ) : (
                          <Text style={styles.acceptButtonText}>ACCEPT</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>TERRITORY HISTORY</Text>
              <Text style={styles.sectionSubtitle}>
                A timeline of ownership events
              </Text>
            </View>

            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{history.length}</Text>
            </View>
          </View>

          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>◷</Text>
              </View>
              <Text style={styles.emptyTitle}>No history available</Text>
              <Text style={styles.emptyDescription}>
                Ownership events will appear here when recorded.
              </Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {history.map((item, index) => {
                const event = getHistoryText(item);
                const isLast = index === history.length - 1;

                return (
                  <View key={item.id} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>

                    <View
                      style={[
                        styles.timelineContent,
                        isLast && styles.timelineContentLast,
                      ]}
                    >
                      <Text style={styles.timelineTitle}>
                        {event.title}
                      </Text>
                      <Text style={styles.timelineDescription}>
                        {event.description}
                      </Text>
                      <Text style={styles.timelineDate}>
                        {formatDateTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {pendingCount > 0 && (
            <Text style={styles.pendingSummary}>
              {pendingCount} pending {pendingCount === 1 ? 'challenge' : 'challenges'}{' '}
              awaiting resolution.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Challenge activity modal */}
      <Modal
        visible={challengeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeChallengeModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, SPACING.lg) },
            ]}
          >
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={styles.modalEyebrow}>TERRITORY BATTLE</Text>
                <Text style={styles.modalTitle}>Choose an activity</Text>
                <Text style={styles.modalSubtitle}>
                  Select an activity with a recorded GPS route.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeChallengeModal}
                disabled={submittingChallenge}
                accessibilityLabel="Close challenge modal"
                activeOpacity={0.8}
              >
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            {activityLoading ? (
              <View style={styles.activityLoading}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.activityLoadingText}>
                  Loading your activities...
                </Text>
              </View>
            ) : activities.length === 0 ? (
              <View style={styles.noActivities}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyIconText}>↗</Text>
                </View>
                <Text style={styles.emptyTitle}>No activities found</Text>
                <Text style={styles.emptyDescription}>
                  Record an activity before challenging this territory.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.activityList}
                contentContainerStyle={styles.activityListContent}
                showsVerticalScrollIndicator={false}
              >
                {activities.map(activity => {
                  const selected = selectedActivityId === activity.id;

                  return (
                    <TouchableOpacity
                      key={activity.id}
                      style={[
                        styles.activityCard,
                        selected && styles.selectedActivityCard,
                      ]}
                      onPress={() => setSelectedActivityId(activity.id)}
                      disabled={submittingChallenge}
                      activeOpacity={0.8}
                    >
                      <View style={styles.activityTop}>
                        <View
                          style={[
                            styles.activityIcon,
                            selected && styles.activityIconSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.activityIconText,
                              selected && styles.activityIconTextSelected,
                            ]}
                          >
                            {activity.activity_type === 'Run'
                              ? '↗'
                              : activity.activity_type === 'Walk'
                                ? '⌁'
                                : '⌁'}
                          </Text>
                        </View>

                        <View style={styles.activityInfo}>
                          <Text style={styles.activityTitle}>
                            {activity.activity_type}
                          </Text>
                          <Text style={styles.activityDate}>
                            {formatDate(activity.created_at)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.radioOuter,
                            selected && styles.radioOuterSelected,
                          ]}
                        >
                          {selected && <View style={styles.radioInner} />}
                        </View>
                      </View>

                      <View style={styles.activityStats}>
                        <View>
                          <Text style={styles.activityStatLabel}>
                            DISTANCE
                          </Text>
                          <Text style={styles.activityStatValue}>
                            {formatDistance(activity.distance_km)}
                          </Text>
                        </View>

                        <View>
                          <Text style={styles.activityStatLabel}>PACE</Text>
                          <Text style={styles.activityStatValue}>
                            {activity.pace || '—'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!selectedActivityId || submittingChallenge) &&
                styles.submitButtonDisabled,
              ]}
              disabled={!selectedActivityId || submittingChallenge}
              onPress={submitChallenge}
              activeOpacity={0.85}
            >
              {submittingChallenge ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>
                    SUBMIT CHALLENGE
                  </Text>
                  <Text style={styles.submitButtonArrow}>↗</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default TerritoryDetailsScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scroll: {
    flex: 1,
  },

  container: {
    paddingHorizontal: SPACING.md,
    paddingTop: 20,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },

  loadingIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: SPACING.lg,
  },

  loadingSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: SPACING.sm,
  },

  errorIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255,90,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  errorIconText: {
    color: COLORS.danger,
    fontSize: 25,
    fontWeight: '900',
  },

  errorTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },

  errorDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  retryButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    borderRadius: 13,
  },

  retryText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  // Header
  header: {
    paddingBottom: SPACING.lg,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },

  eyebrow: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  pageTitle: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },

  pageTitleAccent: {
    color: COLORS.accent,
  },

  pageSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: SPACING.md,
    maxWidth: 320,
  },

  // Hero
  heroCard: {
    backgroundColor: COLORS.accent,
    borderRadius: 23,
    padding: SPACING.lg,
    marginBottom: 28,
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  heroLabel: {
    color: 'rgba(10,10,10,0.65)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  areaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 5,
  },

  heroValue: {
    color: COLORS.background,
    fontSize: 43,
    fontWeight: '900',
    letterSpacing: -1.5,
  },

  heroUnit: {
    color: 'rgba(10,10,10,0.65)',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 7,
  },

  heroIcon: {
    width: 53,
    height: 53,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroIconText: {
    color: COLORS.background,
    fontSize: 34,
    fontWeight: '700',
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.14)',
    marginVertical: SPACING.md,
  },

  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  ownerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  ownerAvatarText: {
    color: COLORS.background,
    fontSize: 18,
    fontWeight: '900',
  },

  ownerInfo: {
    flex: 1,
  },

  ownerLabel: {
    color: 'rgba(10,10,10,0.58)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  ownerName: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3,
  },

  ownerUsername: {
    color: 'rgba(10,10,10,0.65)',
    fontSize: 10,
    marginTop: 2,
  },

  ownerBadge: {
    backgroundColor: 'rgba(0,0,0,0.10)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },

  ownerBadgeText: {
    color: COLORS.background,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Sections and stats
  sectionHeader: {
    marginBottom: SPACING.md,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 5,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: SPACING.lg,
  },

  statCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '44%',
    minHeight: 91,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
    justifyContent: 'center',
  },

  statLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  statValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },

  statusValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },

  // Challenge CTA
  challengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 17,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },

  challengeButtonIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  challengeButtonIconText: {
    color: COLORS.background,
    fontSize: 22,
    fontWeight: '900',
  },

  challengeButtonContent: {
    flex: 1,
  },

  challengeButtonTitle: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  challengeButtonSubtitle: {
    color: 'rgba(10,10,10,0.7)',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  challengeButtonArrow: {
    color: COLORS.background,
    fontSize: 21,
    fontWeight: '900',
    marginLeft: 8,
  },

  pendingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,198,109,0.3)',
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },

  pendingNoticeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,198,109,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  pendingNoticeIconText: {
    color: COLORS.warning,
    fontSize: 23,
  },

  pendingNoticeContent: {
    flex: 1,
  },

  pendingNoticeTitle: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: '900',
  },

  pendingNoticeDescription: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  section: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },

  sectionCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },

  sectionCountText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
  },

  // Challenge cards
  challengeCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  challengeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },

  challengeUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  challengeAvatar: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: 'rgba(212,255,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  challengeAvatarText: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '900',
  },

  challengeUserInfo: {
    flex: 1,
  },

  challengeName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },

  challengeUsername: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
  },

  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  statusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  challengeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    padding: 12,
    marginTop: SPACING.md,
  },

  challengeStat: {
    flex: 1,
  },

  challengeStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },

  challengeStatLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  challengeStatValue: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 5,
  },

  challengeDate: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: SPACING.md,
  },

  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },

  rejectButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rejectButtonText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  acceptButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  acceptButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Empty states
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  emptyIconText: {
    color: COLORS.accent,
    fontSize: 24,
    fontWeight: '800',
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },

  emptyDescription: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // Timeline
  timeline: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },

  timelineItem: {
    flexDirection: 'row',
  },

  timelineRail: {
    width: 20,
    alignItems: 'center',
    marginRight: 11,
  },

  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
    marginTop: 4,
    zIndex: 1,
  },

  timelineLine: {
    position: 'absolute',
    top: 17,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.border,
  },

  timelineContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.md,
  },

  timelineContentLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
  },

  timelineTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },

  timelineDescription: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  timelineDate: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 7,
  },

  pendingSummary: {
    color: COLORS.warning,
    fontSize: 11,
    lineHeight: 17,
    marginTop: SPACING.md,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    maxHeight: '88%',
  },

  modalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#454545',
    marginBottom: SPACING.lg,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },

  modalHeaderContent: {
    flex: 1,
    paddingRight: SPACING.sm,
  },

  modalEyebrow: {
    color: COLORS.accent,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  modalTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 7,
  },

  modalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: COLORS.textSecondary,
    fontSize: 25,
    lineHeight: 28,
  },

  activityLoading: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },

  activityLoadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: SPACING.md,
  },

  noActivities: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },

  activityList: {
    flexShrink: 1,
    marginBottom: SPACING.md,
  },

  activityListContent: {
    paddingBottom: SPACING.sm,
  },

  activityCard: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },

  selectedActivityCard: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,255,0,0.055)',
  },

  activityTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  activityIconSelected: {
    backgroundColor: COLORS.accent,
  },

  activityIconText: {
    color: COLORS.textSecondary,
    fontSize: 23,
    fontWeight: '800',
  },

  activityIconTextSelected: {
    color: COLORS.background,
  },

  activityInfo: {
    flex: 1,
  },

  activityTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },

  activityDate: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 4,
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioOuterSelected: {
    borderColor: COLORS.accent,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },

  activityStats: {
    flexDirection: 'row',
    gap: 36,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  activityStatLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  activityStatValue: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },

  submitButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 15,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },

  submitButtonDisabled: {
    backgroundColor: '#343434',
  },

  submitButtonText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  submitButtonArrow: {
    color: COLORS.background,
    fontSize: 19,
    fontWeight: '900',
    marginLeft: 9,
  },
});