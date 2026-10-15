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
  useNavigation,
} from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  creator_username: string;
  creator_display_name: string;
  members_count: number;
};

const API_BASE_URL = 'http://127.0.0.1:4000';

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
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/clubs`);
      const data = (await response.json()) as
        | Club[]
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Failed to load clubs',
        );
      }

      setClubs(data as Club[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load clubs',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadClubs();
    }, [loadClubs]),
  );

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

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={clubs}
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

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Clubs Yet</Text>

            <Text style={styles.emptyText}>
              Create the first JogQuest club.
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