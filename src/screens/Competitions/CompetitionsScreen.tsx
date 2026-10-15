import React, { useCallback, useState } from 'react';

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
} from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'Competitions'
>;

type Competition = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  metric: string;
  start_at: string;
  end_at: string;
  participants_count: number;
};

const API_BASE_URL = 'http://127.0.0.1:4000';

const COLORS = {
  background: '#0A0A0A',
  surface: '#121212',
  surfaceLight: '#171717',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
  danger: '#FF4D4D',
  success: '#4ADE80',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
};

const formatDate = (value: string) => {
  if (!value) return 'TBD';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'TBD';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
};

const getStatusStyle = (status: string) => {
  const normalized = status?.toUpperCase();

  if (normalized === 'ACTIVE') {
    return {
      backgroundColor: 'rgba(212,255,0,0.12)',
      color: COLORS.accent,
    };
  }

  if (normalized === 'COMPLETED') {
    return {
      backgroundColor: 'rgba(74,222,128,0.12)',
      color: COLORS.success,
    };
  }

  return {
    backgroundColor: COLORS.surfaceLight,
    color: COLORS.textSecondary,
  };
};

const CompetitionsScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompetitions = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? 'Failed to load competitions.',
        );
      }

      setCompetitions(
        Array.isArray(data) ? (data as Competition[]) : [],
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load competitions.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCompetitions();
    }, [loadCompetitions]),
  );

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>
          Loading competitions...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={competitions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            onRefresh={() => {
              setRefreshing(true);
              loadCompetitions();
            }}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>
                  COMMUNITY CHALLENGES
                </Text>

                <Text style={styles.title}>
                  COMPETE<Text style={styles.titleAccent}>.</Text>
                </Text>

                <Text style={styles.subtitle}>
                  Set a goal. Push your limits. Earn your place.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.createButton}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('CreateCompetition')
                }
              >
                <Text style={styles.createButtonText}>+</Text>
                <Text style={styles.createButtonLabel}>CREATE</Text>
              </TouchableOpacity>
            </View>

            {/* Overview */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewTop}>
                <View>
                  <Text style={styles.overviewLabel}>
                    YOUR NEXT CHALLENGE
                  </Text>

                  <Text style={styles.overviewTitle}>
                    Every run counts.
                  </Text>
                </View>

                <View style={styles.overviewIcon}>
                  <Text style={styles.overviewIconText}>↗</Text>
                </View>
              </View>

              <View style={styles.overviewDivider} />

              <View style={styles.overviewStats}>
                <View>
                  <Text style={styles.overviewNumber}>
                    {competitions.length}
                  </Text>
                  <Text style={styles.overviewStatLabel}>
                    CHALLENGES
                  </Text>
                </View>

                <View>
                  <Text style={styles.overviewNumber}>
                    {
                      competitions.filter(
                        item =>
                          item.status?.toUpperCase() === 'ACTIVE',
                      ).length
                    }
                  </Text>
                  <Text style={styles.overviewStatLabel}>
                    ACTIVE NOW
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  ALL CHALLENGES
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Find your next goal
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {competitions.length}
                </Text>
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>
                  Couldn't load competitions
                </Text>

                <Text style={styles.errorText}>{error}</Text>

                <TouchableOpacity
                  onPress={loadCompetitions}
                  style={styles.retryButton}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryButtonText}>
                    TRY AGAIN
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const statusStyle = getStatusStyle(item.status);

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('CompetitionDetails', {
                  competitionId: item.id,
                })
              }
            >
              <View style={styles.cardTop}>
                <View style={styles.cardIndex}>
                  <Text style={styles.cardIndexText}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: statusStyle.backgroundColor },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusStyle.color },
                    ]}
                  />

                  <Text
                    style={[
                      styles.statusText,
                      { color: statusStyle.color },
                    ]}
                  >
                    {item.status || 'UPCOMING'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardName} numberOfLines={2}>
                {item.name}
              </Text>

              <Text
                style={styles.cardDescription}
                numberOfLines={2}
              >
                {item.description?.trim() || 'No description available.'}
              </Text>

              <View style={styles.metricBadge}>
                <Text style={styles.metricLabel}>TRACKING</Text>
                <Text style={styles.metricValue}>
                  {item.metric || 'RUNNING'}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.footerBlock}>
                  <Text style={styles.footerLabel}>START DATE</Text>
                  <Text style={styles.footerValue}>
                    {formatDate(item.start_at)}
                  </Text>
                </View>

                <View style={styles.footerDivider} />

                <View style={styles.footerBlock}>
                  <Text style={styles.footerLabel}>END DATE</Text>
                  <Text style={styles.footerValue}>
                    {formatDate(item.end_at)}
                  </Text>
                </View>

                <View style={styles.footerDivider} />

                <View style={styles.footerBlock}>
                  <Text style={styles.footerLabel}>PLAYERS</Text>
                  <Text style={styles.footerValue}>
                    {item.participants_count ?? 0}
                  </Text>
                </View>
              </View>

              <View style={styles.cardAction}>
                <Text style={styles.cardActionText}>
                  VIEW CHALLENGE
                </Text>
                <Text style={styles.cardActionArrow}>↗</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>🏁</Text>
              </View>

              <Text style={styles.emptyTitle}>
                No competitions yet
              </Text>

              <Text style={styles.emptyText}>
                Be the first to create a challenge and bring the
                community together.
              </Text>

              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('CreateCompetition')
                }
              >
                <Text style={styles.emptyButtonText}>
                  CREATE FIRST CHALLENGE
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
};

export default CompetitionsScreen;

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
  },

  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: SPACING.md,
  },

  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingTop: 18,
    paddingBottom: SPACING.lg,
  },

  headerText: {
    flex: 1,
  },

  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 8,
  },

  title: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  titleAccent: {
    color: COLORS.accent,
  },

  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 240,
  },

  createButton: {
    minWidth: 72,
    minHeight: 66,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  createButtonText: {
    color: COLORS.background,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 28,
  },

  createButtonLabel: {
    color: COLORS.background,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 2,
  },

  // Overview
  overviewCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: SPACING.lg,
    marginBottom: 28,
  },

  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  overviewLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  overviewTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },

  overviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(212,255,0,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overviewIconText: {
    color: COLORS.accent,
    fontSize: 24,
    fontWeight: '800',
  },

  overviewDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },

  overviewStats: {
    flexDirection: 'row',
    gap: 48,
  },

  overviewNumber: {
    color: COLORS.accent,
    fontSize: 25,
    fontWeight: '900',
  },

  overviewStatLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 4,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  countBadgeText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
  },

  // Competition card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  cardIndex: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardIndexText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  cardName: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 27,
  },

  cardDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: SPACING.sm,
  },

  metricBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: SPACING.md,
  },

  metricLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  metricValue: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  footerBlock: {
    flex: 1,
  },

  footerDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
    marginHorizontal: 7,
  },

  footerLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  footerValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },

  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  cardActionText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  cardActionArrow: {
    color: COLORS.accent,
    fontSize: 19,
    fontWeight: '800',
  },

  // Empty / Error
  emptyCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 36,
    marginTop: 4,
  },

  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  emptyIconText: {
    fontSize: 28,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },

  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  emptyButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    marginTop: SPACING.lg,
  },

  emptyButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  errorBox: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.35)',
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  errorTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: SPACING.md,
  },

  retryButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
  },
});

