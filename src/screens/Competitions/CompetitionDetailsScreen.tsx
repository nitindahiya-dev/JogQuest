import React, { useCallback, useEffect, useState } from 'react';

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
} from '@react-navigation/native';

import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';

const API_BASE_URL = 'http://127.0.0.1:4000';

type Metric = 'DISTANCE' | 'TERRITORY' | 'ACTIVITIES';

type Competition = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  metric: Metric;
  start_at: string;
  end_at: string;
  participants_count: number;
};

type LeaderboardEntry = {
  user_id: string;
  rank: number;
  score: number;
  display_name: string;
  username: string;
};

type Membership = {
  joined?: boolean;
  error?: string;
};

const CompetitionDetailsScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user, token } = useAuth();

  const userId = user?.id;
  const { competitionId } = route.params;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompetition = useCallback(async () => {
    if (!userId) {
      setError('Please log in to view competition details.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const [
        competitionResponse,
        leaderboardResponse,
        membershipResponse,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/competitions/${competitionId}`),
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/leaderboard`,
        ),
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/membership/${userId}`,
        ),
      ]);

      const competitionData = await competitionResponse.json();
      const leaderboardData = await leaderboardResponse.json();
      const membershipData = (await membershipResponse.json()) as Membership;

      if (!competitionResponse.ok) {
        throw new Error(
          competitionData?.error ?? 'Failed to load competition.',
        );
      }

      if (!leaderboardResponse.ok) {
        throw new Error(
          leaderboardData?.error ?? 'Failed to load leaderboard.',
        );
      }

      if (!membershipResponse.ok) {
        throw new Error(
          membershipData.error ?? 'Failed to load membership.',
        );
      }

      setCompetition(competitionData as Competition);
      setLeaderboard(
        Array.isArray(leaderboardData) ? leaderboardData : [],
      );
      setJoined(membershipData.joined ?? false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load competition.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId, userId]);

  useFocusEffect(
    useCallback(() => {
      loadCompetition();

      const interval = setInterval(loadCompetition, 30000);

      return () => clearInterval(interval);
    }, [loadCompetition]),
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleJoin = async () => {
    if (!userId || !competition || actionLoading) return;

    if (competition.status === 'ENDED') return;

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competition.id}/join/${userId}`,
        {
          method: joined ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? 'Failed to update competition membership.',
        );
      }

      await loadCompetition();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update competition membership.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (days > 0) {
      return `${days}d ${String(hours).padStart(2, '0')}h ${String(
        minutes,
      ).padStart(2, '0')}m`;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0',
    )}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const getRemaining = () => {
    if (!competition) return null;

    const start = new Date(competition.start_at).getTime();
    const end = new Date(competition.end_at).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { label: 'SCHEDULE', value: 'Awaiting dates' };
    }

    if (now < start) {
      return {
        label: 'STARTS IN',
        value: formatDuration(start - now),
      };
    }

    if (now >= end) {
      return { label: 'CHALLENGE ENDED', value: '00:00:00' };
    }

    return {
      label: 'TIME REMAINING',
      value: formatDuration(end - now),
    };
  };

  const formatScore = (score: number) => {
    const value = Number(score);

    if (!Number.isFinite(value)) return '0';

    if (competition?.metric === 'DISTANCE') {
      return `${value.toFixed(2)} km`;
    }

    if (competition?.metric === 'TERRITORY') {
      return `${value.toFixed(3)} km²`;
    }

    return String(Math.round(value));
  };

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) return 'Not scheduled';

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isEnded = competition?.status === 'ENDED';
  const remaining = getRemaining();
  const currentUser = leaderboard.find(
    item => item.user_id === userId,
  );

  const statusColor =
    competition?.status === 'ACTIVE'
      ? COLORS.accent
      : competition?.status === 'ENDED'
        ? COLORS.danger
        : COLORS.textSecondary;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>
          Loading competition...
        </Text>
      </View>
    );
  }

  if (!competition) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>!</Text>
        </View>

        <Text style={styles.emptyTitle}>
          Competition unavailable
        </Text>

        <Text style={styles.emptyDescription}>
          {error ?? 'This competition could not be found.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            loadCompetition();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.retryButtonText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leaderboard}
        keyExtractor={item => item.user_id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadCompetition();
            }}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.eyebrowRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusColor },
                    ]}
                  />

                  <Text style={styles.eyebrow}>
                    COMMUNITY CHALLENGE
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { borderColor: statusColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusColor },
                    ]}
                  >
                    {competition.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroName}>
                {competition.name}
              </Text>

              <Text style={styles.heroDescription}>
                {competition.description?.trim() ||
                  'No description available for this challenge.'}
              </Text>

              <View style={styles.heroDivider} />

              <View style={styles.heroDates}>
                <View style={styles.dateBlock}>
                  <Text style={styles.dateLabel}>START DATE</Text>
                  <Text style={styles.dateValue}>
                    {formatDate(competition.start_at)}
                  </Text>
                </View>

                <View style={styles.dateDivider} />

                <View style={styles.dateBlock}>
                  <Text style={styles.dateLabel}>END DATE</Text>
                  <Text style={styles.dateValue}>
                    {formatDate(competition.end_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Countdown */}
            <View style={styles.timerCard}>
              <View style={styles.timerTop}>
                <View style={styles.timerIndicator} />
                <Text style={styles.timerLabel}>
                  {remaining?.label}
                </Text>
              </View>

              <Text
                style={[
                  styles.timerValue,
                  remaining?.value === 'Awaiting dates' &&
                    styles.timerValueSmall,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {remaining?.value}
              </Text>

              <Text style={styles.timerCaption}>
                {competition.status === 'ACTIVE'
                  ? 'Every effort counts. Keep moving.'
                  : competition.status === 'ENDED'
                    ? 'This challenge has finished.'
                    : 'Get ready for the challenge.'}
              </Text>
            </View>

            {/* Personal ranking */}
            {currentUser && (
              <View style={styles.youCard}>
                <View style={styles.youCardTop}>
                  <Text style={styles.youEyebrow}>
                    YOUR PERFORMANCE
                  </Text>
                  <Text style={styles.youBadge}>YOU</Text>
                </View>

                <View style={styles.youStats}>
                  <View style={styles.youStat}>
                    <Text style={styles.youLabel}>YOUR RANK</Text>
                    <Text style={styles.youRank}>
                      #{currentUser.rank}
                    </Text>
                  </View>

                  <View style={styles.youDivider} />

                  <View style={styles.youStat}>
                    <Text style={styles.youLabel}>YOUR SCORE</Text>
                    <Text
                      style={styles.youScore}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatScore(Number(currentUser.score))}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Join / leave */}
            {!isEnded && (
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  joined && styles.leaveButton,
                ]}
                onPress={toggleJoin}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator
                    color={
                      joined ? COLORS.danger : COLORS.background
                    }
                  />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.joinButtonText,
                        joined && styles.leaveButtonText,
                      ]}
                    >
                      {joined
                        ? 'LEAVE CHALLENGE'
                        : 'JOIN CHALLENGE'}
                    </Text>

                    <Text
                      style={[
                        styles.joinButtonArrow,
                        joined && styles.leaveButtonText,
                      ]}
                    >
                      {joined ? '−' : '↗'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>
                  Action unsuccessful
                </Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>◎</Text>
                <Text style={styles.statValue}>
                  {competition.participants_count ?? leaderboard.length}
                </Text>
                <Text style={styles.statLabel}>PARTICIPANTS</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statIcon}>↗</Text>
                <Text style={styles.statValue}>
                  {competition.metric === 'DISTANCE'
                    ? 'KM'
                    : competition.metric === 'TERRITORY'
                      ? 'KM²'
                      : 'COUNT'}
                </Text>
                <Text style={styles.statLabel}>SCORING UNIT</Text>
              </View>
            </View>

            {/* Leaderboard heading */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeadingLeft}>
                <Text style={styles.sectionEyebrow}>
                  THE RACE
                </Text>

                <Text style={styles.sectionTitle}>
                  Leaderboard
                </Text>

                <Text style={styles.sectionSubtitle}>
                  See who's leading the challenge.
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {leaderboard.length}
                </Text>
              </View>
            </View>

            {/* Table header */}
            {leaderboard.length > 0 && (
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderRank}>RANK</Text>
                <Text style={styles.tableHeaderAthlete}>
                  ATHLETE
                </Text>
                <Text style={styles.tableHeaderScore}>SCORE</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentUser = item.user_id === userId;
          const displayName = item.display_name?.trim() || 'Runner';
          const initial = displayName.charAt(0).toUpperCase();

          return (
            <TouchableOpacity
              style={[
                styles.leaderboardRow,
                isCurrentUser && styles.currentUserRow,
              ]}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('PublicProfile', {
                  userId: item.user_id,
                })
              }
            >
              <View style={styles.rankColumn}>
                {item.rank <= 3 ? (
                  <View
                    style={[
                      styles.medal,
                      item.rank === 1 && styles.goldMedal,
                      item.rank === 2 && styles.silverMedal,
                      item.rank === 3 && styles.bronzeMedal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.medalText,
                        item.rank === 1 && styles.goldMedalText,
                      ]}
                    >
                      {item.rank}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.rankText,
                      isCurrentUser && styles.highlightText,
                    ]}
                  >
                    {String(item.rank).padStart(2, '0')}
                  </Text>
                )}
              </View>

              <View
                style={[
                  styles.avatar,
                  isCurrentUser && styles.currentUserAvatar,
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    isCurrentUser && styles.currentUserAvatarText,
                  ]}
                >
                  {initial}
                </Text>
              </View>

              <View style={styles.athleteInfo}>
                <View style={styles.athleteNameRow}>
                  <Text
                    style={[
                      styles.userName,
                      isCurrentUser && styles.highlightText,
                    ]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>

                  {isCurrentUser && (
                    <View style={styles.youTag}>
                      <Text style={styles.youTagText}>YOU</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.userUsername} numberOfLines={1}>
                  @{item.username || 'runner'}
                </Text>
              </View>

              <View style={styles.scoreColumn}>
                <Text
                  style={[
                    styles.userScore,
                    isCurrentUser && styles.highlightText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatScore(Number(item.score))}
                </Text>

                <Text style={styles.scoreCaption}>SCORE</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyLeaderboard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>🏁</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No runners yet
            </Text>

            <Text style={styles.emptyDescription}>
              Be the first to join this challenge and claim your place.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Text style={styles.footerNote}>
            Rankings update as competition data changes.
          </Text>
        }
      />
    </View>
  );
};

export default CompetitionDetailsScreen;

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
    padding: SPACING.xl,
  },

  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 48,
  },

  loadingText: {
    ...TYPOGRAPHY.caption,
    marginTop: SPACING.md,
  },

  // Hero
  hero: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  eyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },

  statusBadge: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
  },

  heroName: {
    ...TYPOGRAPHY.hero,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.5,
  },

  heroDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },

  heroDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },

  heroDates: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dateBlock: {
    flex: 1,
  },

  dateDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },

  dateLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
  },

  dateValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },

  // Countdown
  timerCard: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 22,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },

  timerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  timerIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  timerLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },

  timerValue: {
    color: COLORS.accent,
    fontSize: 37,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: SPACING.md,
  },

  timerValueSmall: {
    fontSize: 25,
    letterSpacing: 0,
  },

  timerCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },

  // Personal performance
  youCard: {
    backgroundColor: 'rgba(212,255,0,0.07)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  youCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  youEyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },

  youBadge: {
    color: COLORS.background,
    backgroundColor: COLORS.accent,
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: '900',
  },

  youStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  youStat: {
    flex: 1,
  },

  youDivider: {
    width: 1,
    height: 48,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },

  youLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    fontSize: 9,
  },

  youRank: {
    color: COLORS.accent,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 5,
  },

  youScore: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 9,
  },

  // Join
  joinButton: {
    minHeight: 58,
    backgroundColor: COLORS.accent,
    borderRadius: 17,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  leaveButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.danger,
    ...SHADOWS.soft,
  },

  joinButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  leaveButtonText: {
    color: COLORS.danger,
  },

  joinButtonArrow: {
    color: COLORS.background,
    fontSize: 19,
    fontWeight: '900',
    marginLeft: 10,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },

  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statIcon: {
    color: COLORS.accent,
    fontSize: 21,
    fontWeight: '800',
  },

  statValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 21,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },

  statLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 5,
  },

  // Leaderboard heading
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  sectionHeadingLeft: {
    flex: 1,
  },

  sectionEyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.accent,
    letterSpacing: 1.2,
  },

  sectionTitle: {
    ...TYPOGRAPHY.hero,
    fontSize: 24,
    marginTop: 5,
  },

  sectionSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 5,
  },

  countBadge: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },

  countBadgeText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
  },

  // Table header
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 12,
  },

  tableHeaderRank: {
    width: 36,
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  tableHeaderAthlete: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 12,
  },

  tableHeaderScore: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Leaderboard rows
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  currentUserRow: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,255,0,0.06)',
  },

  rankColumn: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  rankText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },

  medal: {
    width: 27,
    height: 27,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceHighlight,
  },

  goldMedal: {
    backgroundColor: COLORS.accent,
  },

  silverMedal: {
    backgroundColor: '#D1D5DB',
  },

  bronzeMedal: {
    backgroundColor: '#CD9A69',
  },

  medalText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
  },

  goldMedalText: {
    color: COLORS.background,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  currentUserAvatar: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  avatarText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  currentUserAvatarText: {
    color: COLORS.background,
  },

  athleteInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },

  athleteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  userName: {
    ...TYPOGRAPHY.h3,
    fontSize: 12,
    flexShrink: 1,
  },

  highlightText: {
    color: COLORS.accent,
  },

  youTag: {
    backgroundColor: 'rgba(212,255,0,0.12)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },

  youTagText: {
    color: COLORS.accent,
    fontSize: 7,
    fontWeight: '900',
  },

  userUsername: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    marginTop: 4,
  },

  scoreColumn: {
    alignItems: 'flex-end',
    maxWidth: 100,
    marginLeft: 8,
  },

  userScore: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
  },

  scoreCaption: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 7,
    marginTop: 4,
  },

  // Empty / error
  emptyLeaderboard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  emptyIconText: {
    color: COLORS.accent,
    fontSize: 25,
    fontWeight: '900',
  },

  emptyTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    textAlign: 'center',
  },

  emptyDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    borderRadius: 13,
    marginTop: SPACING.lg,
  },

  retryButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  errorBox: {
    backgroundColor: 'rgba(255,69,58,0.08)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  errorTitle: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '900',
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  footerNote: {
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
});