import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

type Activity = {
  id: string;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  distance_km: number;
  elapsed_seconds: number;
  pace: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  territory_id: string | null;
  territory_area_m2: number | null;
  territory_area_km2: number | null;
};

const API_BASE_URL = 'http://10.0.2.2:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const formatDuration = (
  seconds: number,
) => {
  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );

  const remainingSeconds =
    seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(
      2,
      '0',
    )}:${String(remainingSeconds).padStart(
      2,
      '0',
    )}`;
  }

  return `${minutes}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`;
};

const formatDate = (
  value: string,
) => {
  return new Date(value).toLocaleDateString(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  );
};

const ActivityHistoryScreen = () => {
  const [activities, setActivities] =
    useState<Activity[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadActivities = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/api/activities/${DEV_USER_ID}`,
        );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as Activity[];

        setActivities(data);
      } catch (err) {
        console.error(
          'Failed to load activities:',
          err,
        );

        setError(
          'Could not load activity history.',
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
      loadActivities();
    }, [loadActivities]),
  );

  const totalDistance =
    activities.reduce(
      (total, activity) =>
        total + Number(activity.distance_km),
      0,
    );

  const totalTime =
    activities.reduce(
      (total, activity) =>
        total + Number(activity.elapsed_seconds),
      0,
    );

  const totalTerritory =
    activities.reduce(
      (total, activity) =>
        total +
        Number(
          activity.territory_area_km2 ?? 0,
        ),
      0,
    );

  const renderActivity = ({
    item,
  }: {
    item: Activity;
  }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.activityType}>
              {item.activity_type.toUpperCase()}
            </Text>

            <Text style={styles.date}>
              {formatDate(item.created_at)}
            </Text>
          </View>

          {item.territory_id && (
            <View style={styles.territoryBadge}>
              <Text
                style={
                  styles.territoryBadgeText
                }>
                TERRITORY
              </Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.value}>
              {Number(
                item.distance_km,
              ).toFixed(2)}
            </Text>

            <Text style={styles.label}>
              KM
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.value}>
              {formatDuration(
                Number(
                  item.elapsed_seconds,
                ),
              )}
            </Text>

            <Text style={styles.label}>
              TIME
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.value}>
              {item.pace}
            </Text>

            <Text style={styles.label}>
              PACE
            </Text>
          </View>
        </View>

        {item.territory_id && (
          <View style={styles.territoryRow}>
            <Text style={styles.territoryText}>
              Territory captured
            </Text>

            <Text
              style={
                styles.territoryArea
              }>
              {Number(
                item.territory_area_km2 ?? 0,
              ).toFixed(3)}{' '}
              km²
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading activities...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={activities}
        keyExtractor={item => item.id}
        renderItem={renderActivity}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() =>
              loadActivities(true)
            }
            tintColor="#fff"
          />
        }
        contentContainerStyle={
          activities.length === 0
            ? styles.emptyContent
            : styles.listContent
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>
              Activity History
            </Text>

            <Text style={styles.subtitle}>
              Your completed quests
            </Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryStat}>
                <Text
                  style={
                    styles.summaryValue
                  }>
                  {activities.length}
                </Text>

                <Text
                  style={
                    styles.summaryLabel
                  }>
                  ACTIVITIES
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryStat}>
                <Text
                  style={
                    styles.summaryValue
                  }>
                  {totalDistance.toFixed(2)}
                </Text>

                <Text
                  style={
                    styles.summaryLabel
                  }>
                  KM
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryStat}>
                <Text
                  style={
                    styles.summaryValue
                  }>
                  {totalTerritory.toFixed(3)}
                </Text>

                <Text
                  style={
                    styles.summaryLabel
                  }>
                  TERRITORY KM²
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
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No Activities Yet
            </Text>

            <Text style={styles.emptyText}>
              Complete your first run, walk,
              or cycle to see it here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default ActivityHistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  listContent: {
    padding: 15,
    paddingBottom: 30,
  },

  emptyContent: {
    flexGrow: 1,
    padding: 15,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: '#888',
    marginTop: 12,
  },

  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 10,
  },

  subtitle: {
    color: '#777',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
  },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#222',
  },

  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },

  summaryValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },

  summaryLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 5,
  },

  summaryDivider: {
    width: 1,
    backgroundColor: '#292929',
  },

  card: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  activityType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },

  date: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },

  territoryBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#444',
  },

  territoryBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },

  statsRow: {
    flexDirection: 'row',
    marginTop: 20,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  label: {
    color: '#666',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 4,
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  territoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  territoryText: {
    color: '#888',
    fontSize: 12,
  },

  territoryArea: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  errorBox: {
    backgroundColor: '#171717',
    borderRadius: 14,
    padding: 14,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },

  errorText: {
    color: '#aaa',
    fontSize: 13,
  },

  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 80,
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
});
