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
} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useAuth} from '../../auth/AuthContext';

type LeaderboardPlayer = {
  rank: number;
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  territory_km2: number;
  territories_captured: number;
  activities_count: number;
  total_distance_km: number;
};

type LeaderboardScope =
  | 'Global'
  | 'City'
  | 'Friends';

// ─── Dummy data for City & Friends (dev / offline) ───
const DUMMY_CITY_PLAYERS: LeaderboardPlayer[] = [
  {
    rank: 1,
    id: 'city-1',
    username: 'cityking',
    display_name: 'Alex Rivera',
    avatar_url: null,
    territory_km2: 12.45,
    territories_captured: 18,
    activities_count: 42,
    total_distance_km: 210.5,
  },
  {
    rank: 2,
    id: 'city-2',
    username: 'runner_mia',
    display_name: 'Mia Chen',
    avatar_url: null,
    territory_km2: 9.87,
    territories_captured: 14,
    activities_count: 35,
    total_distance_km: 178.2,
  },
  {
    rank: 3,
    id: 'city-3',
    username: 'pace_jordan',
    display_name: 'Jordan Lee',
    avatar_url: null,
    territory_km2: 8.12,
    territories_captured: 11,
    activities_count: 29,
    total_distance_km: 156.8,
  },
  {
    rank: 4,
    id: 'city-4',
    username: 'sprint_sam',
    display_name: 'Sam Okonkwo',
    avatar_url: null,
    territory_km2: 6.54,
    territories_captured: 9,
    activities_count: 24,
    total_distance_km: 132.1,
  },
  {
    rank: 5,
    id: 'city-5',
    username: 'trail_taylor',
    display_name: 'Taylor Brooks',
    avatar_url: null,
    territory_km2: 5.21,
    territories_captured: 7,
    activities_count: 19,
    total_distance_km: 98.4,
  },
];

const DUMMY_FRIENDS_PLAYERS: LeaderboardPlayer[] = [
  {
    rank: 1,
    id: 'friend-1',
    username: 'bestie_run',
    display_name: 'Casey Morgan',
    avatar_url: null,
    territory_km2: 7.89,
    territories_captured: 12,
    activities_count: 31,
    total_distance_km: 145.6,
  },
  {
    rank: 2,
    id: 'friend-2',
    username: 'pack_leader',
    display_name: 'Riley Quinn',
    avatar_url: null,
    territory_km2: 6.33,
    territories_captured: 10,
    activities_count: 27,
    total_distance_km: 128.9,
  },
  {
    rank: 3,
    id: 'friend-3',
    username: 'weekend_warrior',
    display_name: 'Avery Kim',
    avatar_url: null,
    territory_km2: 4.56,
    territories_captured: 8,
    activities_count: 22,
    total_distance_km: 102.3,
  },
  {
    rank: 4,
    id: 'friend-4',
    username: 'dawn_dash',
    display_name: 'Jamie Soto',
    avatar_url: null,
    territory_km2: 3.18,
    territories_captured: 5,
    activities_count: 15,
    total_distance_km: 74.7,
  },
];

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
};

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
};

const LeaderboardScreen = () => {
  const {user, token} = useAuth();
  const insets = useSafeAreaInsets();

  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [selectedScope, setSelectedScope] = useState<LeaderboardScope>('Global');
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (players.length === 0) {
        setLoading(true);
      }

      setError(null);

      // Dummy data for City & Friends tabs
      if (selectedScope === 'City') {
        await new Promise(resolve => setTimeout(resolve, 400));
        setPlayers(DUMMY_CITY_PLAYERS);
        return;
      }
      if (selectedScope === 'Friends') {
        await new Promise(resolve => setTimeout(resolve, 400));
        setPlayers(DUMMY_FRIENDS_PLAYERS);
        return;
      }

      // Real API for Global (and future real City/Friends)
      const headers: Record<string, string> = {};
      if (selectedScope !== 'Global') {
        if (!token) {
          throw new Error('Please log in to view this leaderboard.');
        }
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/leaderboard?scope=${selectedScope}`,
        {headers},
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as LeaderboardPlayer[];
      setPlayers(data);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      setPlayers([]);
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load leaderboard.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [selectedScope, token, players.length]);

  useFocusEffect(
    useCallback(() => {
      loadLeaderboard();
    }, [loadLeaderboard]),
  );

  const currentPlayer = players.find(player => player.id === user?.id);

  const topThree = players.slice(0, 3);
  const restPlayers = players.slice(3);

  const renderPlayer = ({item}: {item: LeaderboardPlayer}) => {
    const isCurrentUser = item.id === user?.id;

    return (
      <View
        style={[
          styles.playerCard,
          isCurrentUser && styles.currentUserCard,
        ]}>
        <View style={styles.rankBox}>
          <Text style={styles.rank}>#{item.rank}</Text>
        </View>

        <View style={[styles.avatar, isCurrentUser && styles.currentAvatar]}>
          <Text style={styles.avatarText}>
            {item.display_name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.playerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>

        <View style={styles.scoreBox}>
          <Text style={styles.scoreValue}>
            {Number(item.territory_km2).toFixed(2)}
          </Text>
          <Text style={styles.scoreLabel}>KM²</Text>
        </View>
      </View>
    );
  };

  const renderFilter = (scope: LeaderboardScope) => {
    const active = selectedScope === scope;

    return (
      <TouchableOpacity
        style={[
          active ? styles.filterActive : styles.filter,
        ]}
        onPress={() => setSelectedScope(scope)}>
        <Text style={active ? styles.filterActiveText : styles.filterText}>
          {scope}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {paddingTop: insets.top + 8},
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>LEADERBOARD</Text>
        <Text style={styles.subtitle}>Compete. Capture. Conquer.</Text>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {renderFilter('Global')}
        {renderFilter('City')}
        {renderFilter('Friends')}
      </View>

      {loading && !initialLoading && (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.loadingText}>Updating leaderboard...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadLeaderboard()}>
            <Text style={styles.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top 3 Podium */}
      {topThree.length >= 3 && (
        <View style={styles.podiumContainer}>
          {/* 2nd Place */}
          <View style={[styles.podiumItem, styles.podiumSecond]}>
            <View style={styles.podiumAvatar}>
              <Text style={styles.podiumAvatarText}>
                {topThree[1].display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>
              {topThree[1].display_name.split(' ')[0]}
            </Text>
            <Text style={styles.podiumScore}>
              {Number(topThree[1].territory_km2).toFixed(2)} km²
            </Text>
            <View style={[styles.podiumBase, {height: 70}]} />
            <Text style={styles.podiumRank}>2</Text>
          </View>

          {/* 1st Place */}
          <View style={[styles.podiumItem, styles.podiumFirst]}>
            <View style={[styles.podiumAvatar, styles.podiumAvatarFirst]}>
              <Text style={[styles.podiumAvatarText, {color: COLORS.background}]}>
                {topThree[0].display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>
              {topThree[0].display_name.split(' ')[0]}
            </Text>
            <Text style={[styles.podiumScore, {color: COLORS.accent}]}>
              {Number(topThree[0].territory_km2).toFixed(2)} km²
            </Text>
            <View
              style={[
                styles.podiumBase,
                {height: 100, backgroundColor: COLORS.accent},
              ]}
            />
            <Text style={[styles.podiumRank, {color: COLORS.background}]}>
              1
            </Text>
          </View>

          {/* 3rd Place */}
          <View style={[styles.podiumItem, styles.podiumThird]}>
            <View style={styles.podiumAvatar}>
              <Text style={styles.podiumAvatarText}>
                {topThree[2].display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>
              {topThree[2].display_name.split(' ')[0]}
            </Text>
            <Text style={styles.podiumScore}>
              {Number(topThree[2].territory_km2).toFixed(2)} km²
            </Text>
            <View style={[styles.podiumBase, {height: 55}]} />
            <Text style={styles.podiumRank}>3</Text>
          </View>
        </View>
      )}

      {/* Rest of the list */}
      <FlatList
        data={restPlayers}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.list,
          {paddingBottom: insets.bottom + 160},
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadLeaderboard(true)}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          topThree.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Players Yet</Text>
              <Text style={styles.emptyText}>
                {selectedScope === 'City'
                  ? 'Set your city in Profile Details to join your city leaderboard.'
                  : selectedScope === 'Friends'
                    ? 'Follow other runners to see them here.'
                    : 'Complete an activity to appear on the leaderboard.'}
              </Text>
            </View>
          ) : undefined
        }
        renderItem={renderPlayer}
      />

      {/* Sticky current user rank */}
      {currentPlayer && (
        <View
          style={[
            styles.yourRankCard,
            {bottom: insets.bottom + 90},
          ]}>
          <View>
            <Text style={styles.yourRankLabel}>YOUR RANK</Text>
            <Text style={styles.yourRank}>#{currentPlayer.rank}</Text>
          </View>
          <View style={styles.yourRankRight}>
            <Text style={styles.yourArea}>
              {Number(currentPlayer.territory_km2).toFixed(3)}
            </Text>
            <Text style={styles.yourAreaLabel}>KM² TERRITORY</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default LeaderboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
  },

  header: {
    marginBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },

  filters: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  tabLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  filter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterActive: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
  },
  filterDisabled: {
    opacity: 0.35,
  },
  filterText: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 13,
  },
  filterActiveText: {
    color: COLORS.background,
    fontWeight: '800',
    fontSize: 13,
  },

  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
    height: 210,
  },
  podiumItem: {
    alignItems: 'center',
    flex: 1,
  },
  podiumFirst: {
    zIndex: 2,
  },
  podiumSecond: {},
  podiumThird: {},
  podiumAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  podiumAvatarFirst: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  podiumAvatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
  },
  podiumName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  podiumScore: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  podiumBase: {
    width: '90%',
    backgroundColor: COLORS.surfaceLight,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  podiumRank: {
    position: 'absolute',
    bottom: 10,
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '900',
  },

  list: {
    paddingTop: 12,
  },
  playerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currentUserCard: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212, 255, 0, 0.06)',
  },
  rankBox: {
    width: 42,
  },
  rank: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  currentAvatar: {
    backgroundColor: COLORS.accent,
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
  },
  playerInfo: {
    flex: 1,
  },
  name: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  username: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  scoreBox: {
    alignItems: 'flex-end',
  },
  scoreValue: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  scoreLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  errorBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: 13,
  },
  retryText: {
    color: COLORS.accent,
    fontWeight: '900',
    marginLeft: 15,
    fontSize: 12,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontSize: 14,
  },

  yourRankCard: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yourRankLabel: {
    color: 'rgba(0,0,0,0.55)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  yourRank: {
    color: COLORS.background,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  yourRankRight: {
    alignItems: 'flex-end',
  },
  yourArea: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: '800',
  },
  yourAreaLabel: {
    color: 'rgba(0,0,0,0.55)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
});