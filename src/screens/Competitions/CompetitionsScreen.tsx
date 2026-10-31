import { API_BASE_URL } from '../../config/api';
import React, { useCallback, useMemo, useState } from 'react';
import Geolocation from '@react-native-community/geolocation';

import {
  ActivityIndicator,
  FlatList,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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

import { useAuth } from '../../auth/AuthContext';

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
  created_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
};

type UserLocation = { latitude: number; longitude: number };

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
  const { token } = useAuth();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [myDrafts, setMyDrafts] = useState<Competition[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedMetric, setSelectedMetric] = useState('ALL');
  const [sortBy, setSortBy] = useState('RECOMMENDED');
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [radiusKm, setRadiusKm] = useState(25);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const filteredCompetitions = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    const results = competitions.filter(item => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        (item.description ?? '').toLowerCase().includes(search);

      const status = (item.status ?? 'UPCOMING').toUpperCase();
      const metric = (item.metric ?? '').toUpperCase();

      return (
        matchesSearch &&
        (selectedStatus === 'ALL' || status === selectedStatus) &&
        (selectedMetric === 'ALL' || metric === selectedMetric)
      );
    });

    if (sortBy === 'NEWEST') {
      results.sort(
        (a, b) =>
          new Date(b.created_at ?? b.start_at).getTime() -
          new Date(a.created_at ?? a.start_at).getTime(),
      );
    } else if (sortBy === 'PARTICIPANTS') {
      results.sort(
        (a, b) => (b.participants_count ?? 0) - (a.participants_count ?? 0),
      );
    }

    return results;
  }, [competitions, searchQuery, selectedStatus, selectedMetric, sortBy]);

  const getCurrentLocation = useCallback(async (): Promise<UserLocation> => {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Find nearby challenges',
          message: 'JogQuest uses your location to find nearby competitions.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );

      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Location permission was not granted.');
      }
    }

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        error =>
          reject(
            new Error(
              error.code === 1
                ? 'Location permission denied. Enable it in Android settings.'
                : error.code === 2
                  ? 'Your location is unavailable. Enable device location and try again.'
                  : 'Could not get your location. Please try again.',
            ),
          ),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
      );
    });
  }, []);

  const loadCompetitions = useCallback(
    async (
      location: UserLocation | null = userLocation,
      radius = radiusKm,
    ) => {
      try {
        setError(null);

        const params = new URLSearchParams();
        if (location) {
          params.set('latitude', String(location.latitude));
          params.set('longitude', String(location.longitude));
          params.set('radiusKm', String(radius));
        }
        const query = params.toString();
        const response = await fetch(
          `${API_BASE_URL}/api/competitions${query ? `?${query}` : ''}`,
        );

        const data: any = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? 'Failed to load competitions.');
        }

        setCompetitions(Array.isArray(data) ? (data as Competition[]) : []);
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
    },
    [userLocation, radiusKm],
  );

  const loadMyDrafts = useCallback(async () => {
    if (!token) {
      setMyDrafts([]);
      return;
    }

    try {
      setDraftsLoading(true);
      setDraftsError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/my-drafts`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = (await response.json()) as
        | { error?: string }
        | Competition[];

      if (!response.ok) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : 'Failed to load your drafts.',
        );
      }

      setMyDrafts(
        Array.isArray(data) ? data : [],
      );

      setMyDrafts(Array.isArray(data) ? (data as Competition[]) : []);
    } catch (err) {
      setDraftsError(
        err instanceof Error
          ? err.message
          : 'Failed to load your drafts.',
      );
    } finally {
      setDraftsLoading(false);
    }
  }, [token]);

  const enableNearby = useCallback(async () => {
    try {
      setError(null);
      const location = await getCurrentLocation();
      setUserLocation(location);
      setNearbyEnabled(true);
      await loadCompetitions(location, radiusKm);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not find nearby challenges.',
      );
    }
  }, [getCurrentLocation, loadCompetitions, radiusKm]);

  const disableNearby = useCallback(() => {
    setNearbyEnabled(false);
    setUserLocation(null);
    loadCompetitions(null, radiusKm);
  }, [loadCompetitions, radiusKm]);

  useFocusEffect(
    useCallback(() => {
      loadCompetitions();
      loadMyDrafts();
    }, [loadCompetitions, loadMyDrafts]),
  );

  const refreshAll = useCallback(async () => {
    setRefreshing(true);

    await Promise.all([loadCompetitions(), loadMyDrafts()]);

    setRefreshing(false);
  }, [loadCompetitions, loadMyDrafts]);

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom },
        ]}
      >
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading competitions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredCompetitions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            onRefresh={refreshAll}
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
                <Text style={styles.eyebrow}>COMMUNITY CHALLENGES</Text>

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
                onPress={() => navigation.navigate('CreateCompetition')}
              >
                <Text style={styles.createButtonText}>+</Text>
                <Text style={styles.createButtonLabel}>CREATE</Text>
              </TouchableOpacity>
            </View>

            {/* Overview */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewTop}>
                <View>
                  <Text style={styles.overviewLabel}>YOUR NEXT CHALLENGE</Text>

                  <Text style={styles.overviewTitle}>Every run counts.</Text>
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
                  <Text style={styles.overviewStatLabel}>CHALLENGES</Text>
                </View>

                <View>
                  <Text style={styles.overviewNumber}>
                    {
                      competitions.filter(
                        item => item.status?.toUpperCase() === 'ACTIVE',
                      ).length
                    }
                  </Text>
                  <Text style={styles.overviewStatLabel}>ACTIVE NOW</Text>
                </View>
              </View>
            </View>

            {/* My Drafts */}
            <View style={styles.draftsSection}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>MY DRAFTS</Text>
                  <Text style={styles.sectionSubtitle}>
                    Challenges you're still working on
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{myDrafts.length}</Text>
                </View>
              </View>

              {draftsLoading && myDrafts.length === 0 ? (
                <View style={styles.draftsLoading}>
                  <ActivityIndicator color={COLORS.accent} />
                  <Text style={styles.draftsLoadingText}>
                    Loading your drafts...
                  </Text>
                </View>
              ) : draftsError ? (
                <View style={styles.draftsEmpty}>
                  <Text style={styles.draftsEmptyText}>{draftsError}</Text>

                  <TouchableOpacity
                    onPress={loadMyDrafts}
                    style={styles.draftRetryButton}
                  >
                    <Text style={styles.draftRetryText}>RETRY</Text>
                  </TouchableOpacity>
                </View>
              ) : myDrafts.length === 0 ? (
                <View style={styles.draftsEmpty}>
                  <Text style={styles.draftsEmptyTitle}>No saved drafts</Text>
                  <Text style={styles.draftsEmptyText}>
                    Challenges you create but haven't published will appear
                    here.
                  </Text>
                </View>
              ) : (
                myDrafts.map(draft => (
                  <TouchableOpacity
                    key={draft.id}
                    style={styles.draftCard}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('CompetitionDetails', {
                        competitionId: draft.id,
                      })
                    }
                  >
                    <View style={styles.draftCardTop}>
                      <View style={styles.draftBadge}>
                        <Text style={styles.draftBadgeText}>DRAFT</Text>
                      </View>

                      <Text style={styles.draftArrow}>↗</Text>
                    </View>

                    <Text style={styles.draftName} numberOfLines={2}>
                      {draft.name}
                    </Text>

                    <Text style={styles.draftDescription} numberOfLines={2}>
                      {draft.description?.trim() ||
                        'No description added yet.'}
                    </Text>

                    <View style={styles.draftFooter}>
                      <Text style={styles.draftMetric}>
                        {draft.metric || 'RUNNING'}
                      </Text>

                      <Text style={styles.draftAction}>
                        CONTINUE EDITING →
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>ALL CHALLENGES</Text>
                <Text style={styles.sectionSubtitle}>Find your next goal</Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {filteredCompetitions.length}
                </Text>
              </View>
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search challenges..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={styles.discoverySearch}
              accessibilityLabel="Search competitions by name or description"
            />

            <View style={styles.nearbyPanel}>
              <View style={styles.nearbyPanelText}>
                <Text style={styles.nearbyTitle}>NEARBY CHALLENGES</Text>
                <Text style={styles.nearbySubtitle}>
                  {nearbyEnabled
                    ? `Searching within ${radiusKm} km of your location`
                    : 'Discover competitions around you'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.nearbyButton}
                onPress={nearbyEnabled ? disableNearby : enableNearby}
                activeOpacity={0.85}
              >
                <Text style={styles.nearbyButtonText}>
                  {nearbyEnabled ? 'SHOW ALL' : 'FIND NEARBY'}
                </Text>
              </TouchableOpacity>
              {nearbyEnabled && (
                <View style={styles.radiusRow}>
                  {[5, 10, 25, 50].map(radius => (
                    <TouchableOpacity
                      key={radius}
                      style={[
                        styles.radiusChip,
                        radiusKm === radius && styles.radiusChipActive,
                      ]}
                      onPress={() => {
                        setRadiusKm(radius);
                        if (userLocation) {
                          loadCompetitions(userLocation, radius);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: radiusKm === radius }}
                    >
                      <Text
                        style={[
                          styles.radiusChipText,
                          radiusKm === radius && styles.radiusChipTextActive,
                        ]}
                      >
                        {radius} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.filterHeading}>STATUS</Text>
            <View style={styles.filterRow}>
              {[
                ['ALL', 'All'],
                ['ACTIVE', 'Active'],
                ['UPCOMING', 'Upcoming'],
                ['ENDED', 'Ended'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setSelectedStatus(value)}
                  style={[
                    styles.filterChip,
                    selectedStatus === value && styles.filterChipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedStatus === value }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedStatus === value && styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterHeading}>COMPETITION TYPE</Text>
            <View style={styles.filterRow}>
              {[
                ['ALL', 'All types'],
                ['DISTANCE', 'Distance'],
                ['TERRITORY', 'Territory'],
                ['ACTIVITIES', 'Activities'],
              ].map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setSelectedMetric(value)}
                  style={[
                    styles.filterChip,
                    selectedMetric === value && styles.filterChipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMetric === value }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedMetric === value && styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sortRow}>
              <Text style={styles.filterHeading}>SORT BY</Text>
              <View style={styles.sortOptions}>
                {[
                  ['RECOMMENDED', 'Recommended'],
                  ['NEWEST', 'Newest'],
                  ['PARTICIPANTS', 'Most players'],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setSortBy(value)}
                    style={[
                      styles.sortOption,
                      sortBy === value && styles.sortOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === value && styles.sortOptionTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.resultsText}>
              Showing {filteredCompetitions.length} of {competitions.length}{' '}
              challenges
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>
                  Couldn't load competitions
                </Text>

                <Text style={styles.errorText}>{error}</Text>

                <TouchableOpacity
                  onPress={() => loadCompetitions()}
                  style={styles.retryButton}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryButtonText}>TRY AGAIN</Text>
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
                    style={[styles.statusText, { color: statusStyle.color }]}
                  >
                    {item.status || 'UPCOMING'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardName} numberOfLines={2}>
                {item.name}
              </Text>

              <Text style={styles.cardDescription} numberOfLines={2}>
                {item.description?.trim() || 'No description available.'}
              </Text>

              {nearbyEnabled && typeof item.distance_km === 'number' && (
                <Text style={styles.distanceLabel}>
                  {item.distance_km < 1
                    ? `${Math.round(item.distance_km * 1000)} m away`
                    : `${item.distance_km.toFixed(1)} km away`}
                </Text>
              )}

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
                <Text style={styles.cardActionText}>VIEW CHALLENGE</Text>
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

              <Text style={styles.emptyTitle}>No competitions yet</Text>

              <Text style={styles.emptyText}>
                Be the first to create a challenge and bring the community
                together.
              </Text>

              <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('CreateCompetition')}
              >
                <Text style={styles.emptyButtonText}>
                  CREATE FIRST CHALLENGE
                </Text>
              </TouchableOpacity>
            </View>
          ) : undefined
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

  nearbyPanel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  nearbyPanelText: {
    marginBottom: 12,
  },
  nearbyTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  nearbySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },
  nearbyButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  nearbyButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  radiusChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  radiusChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,255,0,0.10)',
  },
  radiusChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  radiusChipTextActive: {
    color: COLORS.accent,
  },
  distanceLabel: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  discoverySearch: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 14,
    marginTop: 14,
    marginBottom: 16,
  },
  filterHeading: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: COLORS.background,
  },
  sortRow: {
    marginBottom: 10,
  },
  sortOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortOption: {
    borderRadius: 9,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sortOptionActive: {
    backgroundColor: 'rgba(212,255,0,0.12)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  sortOptionText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  sortOptionTextActive: {
    color: COLORS.accent,
  },
  resultsText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 12,
  },

  // My Drafts
  draftsSection: {
    marginBottom: 28,
  },

  draftsLoading: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  draftsLoadingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },

  draftsEmpty: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
  },

  draftsEmptyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },

  draftsEmptyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  draftRetryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
  },

  draftRetryText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
  },

  draftCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.20)',
    borderRadius: 17,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },

  draftCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  draftBadge: {
    backgroundColor: 'rgba(212,255,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },

  draftBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  draftArrow: {
    color: COLORS.accent,
    fontSize: 19,
    fontWeight: '800',
  },

  draftName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
  },

  draftDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  draftFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 14,
    paddingTop: 12,
  },

  draftMetric: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },

  draftAction: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});