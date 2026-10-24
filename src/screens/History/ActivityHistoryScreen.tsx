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
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';

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

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatDate = (value: string) => {
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const ActivityHistoryScreen = () => {
  const insets = useSafeAreaInsets();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, token } = useAuth();

  const loadActivities = useCallback(
    async (isRefresh = false) => {
      if (!user) {
        setActivities([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/api/activities/${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = (await response.json()) as Activity[];
        setActivities(data);
      } catch (err) {
        console.error('Failed to load activities:', err);
        setError('Could not load activity history.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [loadActivities]),
  );

  const totalDistance = activities.reduce(
    (total, activity) => total + Number(activity.distance_km),
    0,
  );

  const totalTerritory = activities.reduce(
    (total, activity) =>
      total + Number(activity.territory_area_km2 ?? 0),
    0,
  );

  const renderActivity = ({ item }: { item: Activity }) => {
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
              <Text style={styles.territoryBadgeText}>
                🏆 CAPTURED
              </Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.value}>
              {Number(item.distance_km).toFixed(2)}
            </Text>

            <Text style={styles.label}>KM</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.value}>
              {formatDuration(Number(item.elapsed_seconds))}
            </Text>

            <Text style={styles.label}>TIME</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.value}>{item.pace}</Text>
            <Text style={styles.label}>PACE</Text>
          </View>
        </View>

        {item.territory_id && (
          <View style={styles.territoryRow}>
            <Text style={styles.territoryText}>
              Territory captured
            </Text>

            <Text style={styles.territoryArea}>
              {Number(item.territory_area_km2 ?? 0).toFixed(3)} km²
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (!user) {
    return (
      <View
        style={[
          styles.center,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
      >
        <Text style={styles.errorText}>
          Authentication required.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.accent} />

        <Text style={styles.loadingText}>
          Loading activities...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={activities}
        keyExtractor={item => item.id}
        renderItem={renderActivity}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadActivities(true)}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={[
          activities.length === 0
            ? styles.emptyContent
            : styles.listContent,
          {
            paddingBottom: insets.bottom + 40,
          },
        ]}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>QUEST LOG</Text>

            <Text style={styles.subtitle}>
              Your completed missions
            </Text>

            {/* Summary cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {activities.length}
                </Text>

                <Text style={styles.summaryLabel}>
                  MISSIONS
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {totalDistance.toFixed(1)}
                </Text>

                <Text style={styles.summaryLabel}>
                  TOTAL KM
                </Text>
              </View>

              <View
                style={[
                  styles.summaryCard,
                  styles.summaryCardAccent,
                ]}
              >
                <Text
                  style={[
                    styles.summaryValue,
                    { color: COLORS.background },
                  ]}
                >
                  {totalTerritory.toFixed(2)}
                </Text>

                <Text
                  style={[
                    styles.summaryLabel,
                    { color: 'rgba(0,0,0,0.55)' },
                  ]}
                >
                  KM² CAPTURED
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

            <Text style={styles.sectionLabel}>
              RECENT ACTIVITIES
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No Missions Yet
            </Text>

            <Text style={styles.emptyText}>
              Complete your first run, walk, or cycle to see it here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

export default ActivityHistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  listContent: {
    padding: SPACING.md,
  },

  emptyContent: {
    flexGrow: 1,
    padding: SPACING.md,
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

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },

  // Header
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 8,
  },

  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },

  // Summary
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },

  summaryCardAccent: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  summaryValue: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '900',
  },

  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Activity card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  activityType: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '900',
  },

  date: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },

  territoryBadge: {
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  territoryBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
  },

  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },

  label: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  divider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  territoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  territoryText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  territoryArea: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '800',
  },

  // Error / Empty
  errorBox: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 70,
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
});