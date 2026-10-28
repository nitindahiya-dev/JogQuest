import { API_BASE_URL } from '../../config/api';
import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
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
import { useAuth } from '../../auth/AuthContext';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'Clubs'
>;

type Club = {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  is_public: boolean;
  created_at: string;
  creator_username?: string;
  creator_display_name?: string;
  members_count: number;
};

type SortOption =
  | 'newest'
  | 'oldest'
  | 'nameAsc'
  | 'nameDesc'
  | 'membersDesc'
  | 'membersAsc';

type VisibilityFilter = 'all' | 'public' | 'private';



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

const ClubsScreen = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'discover' | 'mine'>('discover');
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    try {
      setError(null);

      if (activeTab === 'mine' && (!user?.id || !token)) {
        setClubs([]);
        setError('Please log in to view your clubs.');
        return;
      }

      const url =
        activeTab === 'mine'
          ? `${API_BASE_URL}/api/users/${user!.id}/clubs`
          : `${API_BASE_URL}/api/clubs`;

      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = (await response.json()) as Club[] | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Failed to load clubs',
        );
      }

      setClubs(data as Club[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clubs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, user?.id, token]);

  useFocusEffect(
    useCallback(() => {
      loadClubs();
    }, [loadClubs]),
  );

  const displayedClubs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = clubs.filter(club => {
      if (
        query &&
        !club.name.toLowerCase().includes(query) &&
        !(club.description || '').toLowerCase().includes(query)
      ) {
        return false;
      }

      if (activeTab === 'discover' && !club.is_public) return false;
      if (visibilityFilter === 'public') return club.is_public;
      if (visibilityFilter === 'private') return !club.is_public;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime();
        case 'nameAsc':
          return a.name.localeCompare(b.name);
        case 'nameDesc':
          return b.name.localeCompare(a.name);
        case 'membersDesc':
          return (b.members_count ?? 0) - (a.members_count ?? 0);
        case 'membersAsc':
          return (a.members_count ?? 0) - (b.members_count ?? 0);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime();
      }
    });
  }, [activeTab, clubs, searchQuery, sortOption, visibilityFilter]);

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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>CLUBS</Text>
          <Text style={styles.subtitle}>
            Find your running tribe
          </Text>
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('CreateClub')}
        >
          <Text style={styles.createBtnText}>+ NEW</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.tab, activeTab === 'discover' && styles.activeTab]}
          onPress={() => {
            setActiveTab('discover');
            setVisibilityFilter('all');
            setLoading(true);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'discover' && styles.activeTabText]}>
            DISCOVER
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.tab, activeTab === 'mine' && styles.activeTab]}
          onPress={() => {
            setActiveTab('mine');
            setVisibilityFilter('all');
            setLoading(true);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'mine' && styles.activeTabText]}>
            MY CLUBS
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        accessibilityLabel="Search clubs by name or description"
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search clubs by name or description"
        placeholderTextColor={COLORS.textMuted}
        returnKeyType="search"
        autoCapitalize="none"
        style={styles.searchInput}
      />

      <View style={styles.sortToolbar}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: showSortPanel }}
          style={[
            styles.sortToggle,
            showSortPanel && styles.sortToggleActive,
          ]}
          onPress={() => setShowSortPanel(value => !value)}
          activeOpacity={0.8}>
          <Text
            style={[
              styles.sortToggleText,
              showSortPanel && styles.sortToggleTextActive,
            ]}>
            ⇅  SORT & FILTER
          </Text>
          <Text
            style={[
              styles.sortToggleText,
              showSortPanel && styles.sortToggleTextActive,
            ]}>
            {showSortPanel ? '−' : '+'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.resultCount}>
          {displayedClubs.length} {displayedClubs.length === 1 ? 'CLUB' : 'CLUBS'}
        </Text>
      </View>

      {showSortPanel && (
        <View style={styles.sortPanel}>
          <Text style={styles.sortSectionTitle}>SORT BY</Text>
          <View style={styles.sortOptions}>
            {([
              ['newest', 'Newest first'],
              ['oldest', 'Oldest first'],
              ['nameAsc', 'Name A–Z'],
              ['nameDesc', 'Name Z–A'],
              ['membersDesc', 'Most members'],
              ['membersAsc', 'Fewest members'],
            ] as [SortOption, string][]).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: sortOption === value }}
                style={[
                  styles.sortChip,
                  sortOption === value && styles.sortChipActive,
                ]}
                onPress={() => setSortOption(value)}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.sortChipText,
                    sortOption === value && styles.sortChipTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sortSectionTitle}>VISIBILITY</Text>
          <View style={styles.sortOptions}>
            {([
              ['all', 'All clubs'],
              ['public', 'Public'],
              ...(activeTab === 'mine'
                ? [['private', 'Private'] as [VisibilityFilter, string]]
                : []),
            ] as [VisibilityFilter, string][]).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: visibilityFilter === value }}
                style={[
                  styles.sortChip,
                  visibilityFilter === value && styles.sortChipActive,
                ]}
                onPress={() => setVisibilityFilter(value)}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.sortChipText,
                    visibilityFilter === value && styles.sortChipTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={displayedClubs}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadClubs();
            }}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 40 },
        ]}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('ClubDetails', {
                clubId: item.id,
              })
            }
          >
            <View style={styles.clubIcon}>
              <Text style={styles.clubIconText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.clubBody}>
              <Text style={styles.clubName}>{item.name}</Text>

              <Text
                style={styles.clubDescription}
                numberOfLines={1}
              >
                {item.description || 'No description'}
              </Text>

              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  👥 {item.members_count}{' '}
                  {item.members_count === 1 ? 'member' : 'members'}
                </Text>

                <Text style={styles.meta}>
                  @{item.creator_username}
                </Text>
              </View>
            </View>

            <View style={styles.cardAction}>
              <Text style={styles.viewClub}>{activeTab === 'mine' ? 'OPEN' : 'VIEW'}</Text>
              <Text style={styles.arrow}>›</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim() ? 'No Matching Clubs' : 'No Clubs Yet'}
            </Text>

            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? 'Try another name or description.'
                : activeTab === 'mine'
                  ? 'Join a club or create your own.'
                  : 'Create the first JogQuest club.'}
            </Text>
          </View>
        }
      />
    </View>
  );
};

export default ClubsScreen;

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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 14,
  },

  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },

  createBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  createBtnText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginBottom: 14,
    padding: 4,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceLight,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 11,
  },
  activeTab: { backgroundColor: COLORS.accent },
  tabText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '900' },
  activeTabText: { color: COLORS.background },
  cardAction: { alignItems: 'center', marginLeft: 8 },
  viewClub: { color: COLORS.accent, fontSize: 9, fontWeight: '900' },
  searchInput: {
    marginHorizontal: SPACING.md,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
    color: COLORS.text,
    fontSize: 13,
  },
  sortToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginBottom: 12,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  sortToggleActive: {
    borderColor: COLORS.accent,
  },
  sortToggleText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '900',
  },
  sortToggleTextActive: {
    color: COLORS.accent,
  },
  resultCount: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  sortPanel: {
    marginHorizontal: SPACING.md,
    marginBottom: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  sortSectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 9,
    marginTop: 4,
  },
  sortOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    backgroundColor: COLORS.surfaceLight,
  },
  sortChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  sortChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  sortChipTextActive: {
    color: COLORS.background,
    fontWeight: '900',
  },

  // List
  list: {
    paddingHorizontal: SPACING.md,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  clubIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clubIconText: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: '900',
  },

  clubBody: {
    flex: 1,
    marginLeft: 12,
  },

  clubName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },

  clubDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },

  metaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },

  meta: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },

  arrow: {
    color: COLORS.textMuted,
    fontSize: 26,
    fontWeight: '300',
    marginLeft: 8,
  },

  // Error / Empty
  errorBox: {
    marginHorizontal: SPACING.md,
    marginBottom: 10,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 100,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: COLORS.textMuted,
    marginTop: 8,
    fontSize: 14,
  },
});