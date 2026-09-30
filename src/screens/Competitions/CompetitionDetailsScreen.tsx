import React, {
  useCallback,
  useEffect,
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

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Route =
  RouteProp<
    RootStackParamList,
    'CompetitionDetails'
  >;

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'CompetitionDetails'
  >;

type Competition = {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  metric:
    | 'DISTANCE'
    | 'TERRITORY'
    | 'ACTIVITIES';
  start_at: string;
  end_at: string;
  is_public: boolean;
  created_at: string;
  creator_username: string;
  creator_display_name: string;
  participants_count: number;
  status:
    | 'UPCOMING'
    | 'ACTIVE'
    | 'ENDED';
};

type LeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  score: number;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const CompetitionDetailsScreen = () => {
  const route =
    useRoute<Route>();

  const navigation =
    useNavigation<Navigation>();

  const {
    competitionId,
  } = route.params;

  const [
    competition,
    setCompetition,
  ] = useState<Competition | null>(
    null,
  );

  const [
    leaderboard,
    setLeaderboard,
  ] = useState<
    LeaderboardRow[]
  >([]);

  const [
    joined,
    setJoined,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    now,
    setNow,
  ] = useState(
    Date.now(),
  );

  const loadCompetition =
    useCallback(async (
      isRefresh = false,
    ) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const [
          competitionResponse,
          leaderboardResponse,
          membershipResponse,
        ] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/competitions/${competitionId}`,
          ),

          fetch(
            `${API_BASE_URL}/api/competitions/${competitionId}/leaderboard`,
          ),

          fetch(
            `${API_BASE_URL}/api/competitions/${competitionId}/membership/${DEV_USER_ID}`,
          ),
        ]);

        const competitionData =
          (await competitionResponse.json()) as
            | Competition
            | { error?: string };

        const leaderboardData =
          (await leaderboardResponse.json()) as
            | LeaderboardRow[]
            | { error?: string };

        const membershipData =
          (await membershipResponse.json()) as {
            joined?: boolean;
            error?: string;
          };

        if (!competitionResponse.ok) {
          throw new Error(
            'error' in competitionData &&
            competitionData.error
              ? competitionData.error
              : 'Failed to load competition',
          );
        }

        if (!leaderboardResponse.ok) {
          throw new Error(
            'error' in leaderboardData &&
            leaderboardData.error
              ? leaderboardData.error
              : 'Failed to load leaderboard',
          );
        }

        if (!membershipResponse.ok) {
          throw new Error(
            membershipData.error ??
              'Failed to load membership',
          );
        }

        setCompetition(
          competitionData as Competition,
        );

        setLeaderboard(
          leaderboardData as LeaderboardRow[],
        );

        setJoined(
          membershipData.joined ??
            false,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load competition',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [competitionId]);

  useFocusEffect(
    useCallback(() => {
      loadCompetition();

      const interval =
        setInterval(() => {
          loadCompetition(true);
        }, 30000);

      return () => {
        clearInterval(interval);
      };
    }, [loadCompetition]),
  );

  useEffect(() => {
    const timer =
      setInterval(() => {
        setNow(Date.now());
      }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const toggleJoin =
    async () => {
      if (
        !competition ||
        actionLoading
      ) {
        return;
      }

      if (
        competition.status ===
        'ENDED'
      ) {
        return;
      }

      try {
        setActionLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/competitions/${competition.id}/join/${DEV_USER_ID}`,
            {
              method:
                joined
                  ? 'DELETE'
                  : 'POST',
            },
          );

        const data =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Failed to update competition membership',
          );
        }

        await loadCompetition();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to update competition',
        );
      } finally {
        setActionLoading(false);
      }
    };

  const formatDate = (
    value: string,
  ) => {
    return new Date(
      value,
    ).toLocaleString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      },
    );
  };

const formatRemaining = (): {
  label: string;
  value: string;
} | null => {
  if (!competition) {
    return null;
  }

  const start =
    new Date(
      competition.start_at,
    ).getTime();

  const end =
    new Date(
      competition.end_at,
    ).getTime();

  if (now < start) {
    return {
      label: 'STARTS IN',
      value: formatDuration(
        start - now,
      ),
    };
  }

  if (now >= end) {
    return {
      label: 'ENDED',
      value: '00:00:00',
    };
  }

  return {
    label: 'TIME LEFT',
    value: formatDuration(
      end - now,
    ),
  };
};

  const formatDuration = (
    milliseconds: number,
  ) => {
    const totalSeconds =
      Math.max(
        0,
        Math.floor(
          milliseconds / 1000,
        ),
      );

    const days =
      Math.floor(
        totalSeconds / 86400,
      );

    const hours =
      Math.floor(
        (totalSeconds % 86400) / 3600,
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60,
      );

    const seconds =
      totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${String(
        hours,
      ).padStart(2, '0')}h ${String(
        minutes,
      ).padStart(2, '0')}m`;
    }

    return `${String(
      hours,
    ).padStart(2, '0')}:${String(
      minutes,
    ).padStart(2, '0')}:${String(
      seconds,
    ).padStart(2, '0')}`;
  };

  const metricLabel =
    competition?.metric ===
    'DISTANCE'
      ? 'DISTANCE'
      : competition?.metric ===
          'TERRITORY'
        ? 'TERRITORY'
        : 'ACTIVITIES';

  const formatScore = (
    score: number,
  ) => {
    if (
      competition?.metric ===
      'DISTANCE'
    ) {
      return `${Number(
        score,
      ).toFixed(2)} km`;
    }

    if (
      competition?.metric ===
      'TERRITORY'
    ) {
      return `${Number(
        score,
      ).toFixed(3)} km²`;
    }

    return String(
      Math.round(
        Number(score),
      ),
    );
  };

  const currentUser =
    leaderboard.find(
      item =>
        item.user_id ===
        DEV_USER_ID,
    );

  const remaining =
    formatRemaining();

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

  if (!competition) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ??
            'Competition unavailable.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <FlatList
        data={leaderboard}
        keyExtractor={item =>
          item.user_id
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() =>
              loadCompetition(true)
            }
          />
        }
        contentContainerStyle={
          styles.list
        }

        ListHeaderComponent={
          <View>

            <View style={styles.hero}>

              <View style={styles.icon}>
                <Text style={styles.iconText}>
                  C
                </Text>
              </View>

              <Text style={styles.name}>
                {competition.name}
              </Text>

              <Text style={styles.description}>
                {competition.description ||
                  'No description'}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  competition.status ===
                    'ENDED' &&
                    styles.statusBadgeEnded,
                ]}>

                <Text style={styles.statusText}>
                  {competition.status}
                </Text>

              </View>

            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            )}

            <View style={styles.timerCard}>

              <Text style={styles.timerLabel}>
                {remaining?.label}
              </Text>

              <Text style={styles.timerValue}>
                {remaining?.value}
              </Text>

              {competition.status ===
                'ACTIVE' && (
                <View
                  style={
                    styles.liveIndicator
                  }>
                  <View
                    style={
                      styles.liveDot
                    }
                  />

                  <Text
                    style={
                      styles.liveText
                    }>
                    LIVE
                  </Text>
                </View>
              )}

            </View>

            {currentUser && (
              <View style={styles.youCard}>

                <View>
                  <Text style={styles.youLabel}>
                    YOUR POSITION
                  </Text>

                  <Text style={styles.youRank}>
                    #{currentUser.rank}
                  </Text>
                </View>

                <View
                  style={
                    styles.youScoreBlock
                  }>
                  <Text
                    style={
                      styles.youScore
                    }>
                    {formatScore(
                      Number(
                        currentUser.score,
                      ),
                    )}
                  </Text>

                  <Text
                    style={
                      styles.youScoreLabel
                    }>
                    CURRENT SCORE
                  </Text>
                </View>

              </View>
            )}

            {competition.status !==
              'ENDED' && (
              <TouchableOpacity
                style={
                  joined
                    ? styles.leaveButton
                    : styles.joinButton
                }
                onPress={
                  toggleJoin
                }
                disabled={
                  actionLoading
                }>

                {actionLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      joined
                        ? '#fff'
                        : '#000'
                    }
                  />
                ) : (
                  <Text
                    style={
                      joined
                        ? styles.leaveText
                        : styles.joinText
                    }>
                    {joined
                      ? 'LEAVE COMPETITION'
                      : 'JOIN COMPETITION'}
                  </Text>
                )}

              </TouchableOpacity>
            )}

            <View style={styles.infoCard}>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  {metricLabel}
                </Text>

                <Text style={styles.infoLabel}>
                  METRIC
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  {competition.participants_count}
                </Text>

                <Text style={styles.infoLabel}>
                  PARTICIPANTS
                </Text>
              </View>

            </View>

            <View style={styles.dateCard}>

              <Text style={styles.dateLabel}>
                START
              </Text>

              <Text style={styles.dateValue}>
                {formatDate(
                  competition.start_at,
                )}
              </Text>

              <View
                style={
                  styles.dateDivider
                }
              />

              <Text style={styles.dateLabel}>
                END
              </Text>

              <Text style={styles.dateValue}>
                {formatDate(
                  competition.end_at,
                )}
              </Text>

            </View>

            <View style={styles.leaderboardHeader}>

              <Text
                style={
                  styles.leaderboardTitle
                }>
                Leaderboard
              </Text>

              <Text style={styles.refreshText}>
                AUTO • 30S
              </Text>

            </View>

          </View>
        }

        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.row,
              item.user_id ===
                DEV_USER_ID &&
                styles.currentUserRow,
            ]}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate(
                'PublicProfile',
                {
                  userId:
                    item.user_id,
                },
              )
            }>

            <Text style={styles.rank}>
              #{item.rank}
            </Text>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.display_name
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {item.display_name}
              </Text>

              <Text style={styles.username}>
                @{item.username}
              </Text>
            </View>

            <Text style={styles.score}>
              {formatScore(
                Number(item.score),
              )}
            </Text>

          </TouchableOpacity>
        )}

        ListEmptyComponent={
          <Text style={styles.empty}>
            No participants yet.
          </Text>
        }
      />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  list: {
    padding: 14,
    paddingBottom: 30,
  },

  hero: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },

  icon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    color: '#000',
    fontSize: 25,
    fontWeight: '900',
  },

  name: {
    color: '#fff',
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 13,
  },

  description: {
    color: '#888',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
  },

  statusBadge: {
    marginTop: 11,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  statusBadgeEnded: {
    backgroundColor: '#333',
  },

  statusText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },

  timerCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 18,
    marginTop: 12,
    paddingVertical: 17,
    alignItems: 'center',
  },

  timerLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  timerValue: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 5,
  },

  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 5,
  },

  liveText: {
    color: '#aaa',
    fontSize: 8,
    fontWeight: '900',
  },

  youCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    marginTop: 12,
    padding: 16,
  },

  youLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '900',
  },

  youRank: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 3,
  },

  youScoreBlock: {
    alignItems: 'flex-end',
  },

  youScore: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  youScoreLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 3,
  },

  joinButton: {
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  leaveButton: {
    height: 48,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  joinText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },

  leaveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 18,
    marginTop: 12,
    paddingVertical: 18,
  },

  infoItem: {
    flex: 1,
    alignItems: 'center',
  },

  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  infoLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 5,
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  dateCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 18,
    marginTop: 12,
    padding: 16,
  },

  dateLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '900',
  },

  dateValue: {
    color: '#ddd',
    fontSize: 12,
    marginTop: 5,
  },

  dateDivider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 13,
  },

  leaderboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },

  leaderboardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  refreshText: {
    color: '#444',
    fontSize: 8,
    fontWeight: '800',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
    padding: 11,
    marginBottom: 8,
  },

  currentUserRow: {
    borderColor: '#444',
    backgroundColor: '#151515',
  },

  rank: {
    color: '#777',
    width: 34,
    fontSize: 12,
    fontWeight: '900',
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },

  userInfo: {
    flex: 1,
    marginLeft: 10,
  },

  userName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  username: {
    color: '#666',
    fontSize: 9,
    marginTop: 2,
  },

  score: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 8,
  },

  errorBox: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },

  empty: {
    color: '#555',
    textAlign: 'center',
    paddingVertical: 30,
  },
});

export default CompetitionDetailsScreen;