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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const LeaderboardScreen = () => {
  const [players, setPlayers] =
    useState<LeaderboardPlayer[]>([]);

  const [selectedScope, setSelectedScope] =
    useState<LeaderboardScope>('Global');

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadLeaderboard = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/api/leaderboard`,
        );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as LeaderboardPlayer[];

        setPlayers(data);
      } catch (err) {
        console.error(
          'Failed to load leaderboard:',
          err,
        );

        setError(
          'Could not load leaderboard.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedScope === 'Global') {
        loadLeaderboard();
      }
    }, [loadLeaderboard, selectedScope]),
  );

  const currentPlayer =
    players.find(
      player =>
        player.id === DEV_USER_ID,
    );

  const renderPlayer = ({
    item,
  }: {
    item: LeaderboardPlayer;
  }) => {
    return (
      <View style={styles.playerCard}>
        <View style={styles.rankBox}>
          <Text style={styles.rank}>
            #{item.rank}
          </Text>
        </View>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.display_name
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>

        <View style={styles.playerInfo}>
          <Text style={styles.name}>
            {item.display_name}
          </Text>

          <Text style={styles.username}>
            @{item.username}
          </Text>

          <Text style={styles.area}>
            {Number(
              item.territory_km2,
            ).toFixed(3)}{' '}
            km² territory
          </Text>
        </View>

        <Text style={styles.quest}>
          QUEST
        </Text>
      </View>
    );
  };

  const renderFilter = (
    scope: LeaderboardScope,
  ) => {
    const active =
      selectedScope === scope;

    const disabled =
      scope !== 'Global';

    return (
      <TouchableOpacity
        disabled={disabled}
        style={[
          active
            ? styles.filterActive
            : styles.filter,
          disabled &&
            styles.filterDisabled,
        ]}
        onPress={() =>
          setSelectedScope(scope)
        }>
        <Text
          style={
            active
              ? styles.filterActiveText
              : styles.filterText
          }>
          {scope}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>
          Loading leaderboard...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Leaderboard
      </Text>

      <Text style={styles.subtitle}>
        Compete. Capture. Conquer.
      </Text>

      <View style={styles.filters}>
        {renderFilter('Global')}

        {renderFilter('City')}

        {renderFilter('Friends')}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>

          <TouchableOpacity
            onPress={() =>
              loadLeaderboard()
            }>
            <Text style={styles.retryText}>
              RETRY
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={players}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() =>
              loadLeaderboard(true)
            }
            tintColor="#fff"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No Players Yet
            </Text>

            <Text style={styles.emptyText}>
              Complete an activity to appear
              on the leaderboard.
            </Text>
          </View>
        }
        renderItem={renderPlayer}
      />

      {currentPlayer && (
        <View style={styles.yourRankCard}>
          <Text style={styles.yourRankLabel}>
            YOUR RANK
          </Text>

          <View style={styles.yourRankRow}>
            <Text style={styles.yourRank}>
              #{currentPlayer.rank}
            </Text>

            <Text style={styles.yourArea}>
              {Number(
                currentPlayer.territory_km2,
              ).toFixed(3)}{' '}
              km²
            </Text>
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
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: '#777',
    marginTop: 12,
  },

  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },

  subtitle: {
    color: '#777',
    fontSize: 15,
    marginTop: 5,
  },

  filters: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },

  filter: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292929',
  },

  filterActive: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#fff',
  },

  filterDisabled: {
    opacity: 0.4,
  },

  filterText: {
    color: '#777',
    fontWeight: '700',
  },

  filterActiveText: {
    color: '#000',
    fontWeight: '700',
  },

  list: {
    paddingTop: 20,
    paddingBottom: 130,
  },

  playerCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rankBox: {
    width: 48,
  },

  rank: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },

  playerInfo: {
    flex: 1,
  },

  name: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  username: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },

  area: {
    color: '#777',
    marginTop: 4,
  },

  quest: {
    color: '#555',
    fontSize: 10,
    fontWeight: '800',
  },

  errorBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 14,
    padding: 14,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#333',
  },

  errorText: {
    color: '#aaa',
    flex: 1,
  },

  retryText: {
    color: '#fff',
    fontWeight: '900',
    marginLeft: 15,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 30,
  },

  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  yourRankCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 15,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
  },

  yourRankLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
  },

  yourRankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },

  yourRank: {
    color: '#000',
    fontSize: 24,
    fontWeight: '900',
  },

  yourArea: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
