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

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Navigation =
  NativeStackNavigationProp<
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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const ClubsScreen = () => {
  const navigation =
    useNavigation<Navigation>();

  const [
    clubs,
    setClubs,
  ] = useState<Club[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const loadClubs =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/clubs`,
          );

        const data =
          (await response.json()) as
            | Club[]
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data &&
            data.error
              ? data.error
              : 'Failed to load clubs',
          );
        }

        setClubs(
          data as Club[],
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load clubs',
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
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#fff"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <View style={styles.header}>

        <View>
          <Text style={styles.title}>
            Clubs
          </Text>

          <Text style={styles.subtitle}>
            Find runners with similar goals
          </Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() =>
            navigation.navigate(
              'CreateClub',
            )
          }>

          <Text style={styles.createText}>
            CREATE
          </Text>

        </TouchableOpacity>

      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={clubs}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() => {
              setRefreshing(true);
              loadClubs();
            }}
          />
        }
        contentContainerStyle={
          styles.list
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate(
                'ClubDetails',
                {
                  clubId: item.id,
                },
              )
            }>

            <View style={styles.clubIcon}>
              <Text style={styles.clubIconText}>
                C
              </Text>
            </View>

            <View style={styles.clubBody}>

              <Text style={styles.clubName}>
                {item.name}
              </Text>

              <Text
                style={styles.clubDescription}
                numberOfLines={2}>
                {item.description ||
                  'No description'}
              </Text>

              <View style={styles.metaRow}>

                <Text style={styles.meta}>
                  {item.members_count}{' '}
                  {item.members_count === 1
                    ? 'member'
                    : 'members'}
                </Text>

                <Text style={styles.meta}>
                  @{item.creator_username}
                </Text>

              </View>

            </View>

            <Text style={styles.arrow}>
              ›
            </Text>

          </TouchableOpacity>
        )}

        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              No clubs yet
            </Text>

            <Text style={styles.emptyText}>
              Create the first JogQuest club.
            </Text>
          </View>
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
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },

  title: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
  },

  subtitle: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },

  createButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  createText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },

  list: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },

  clubIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  clubIconText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },

  clubBody: {
    flex: 1,
    marginLeft: 12,
  },

  clubName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  clubDescription: {
    color: '#888',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  metaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },

  meta: {
    color: '#555',
    fontSize: 10,
  },

  arrow: {
    color: '#666',
    fontSize: 24,
    marginLeft: 8,
  },

  errorBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
  },

  empty: {
    alignItems: 'center',
    paddingTop: 100,
  },

  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: '#666',
    marginTop: 8,
  },
});

export default ClubsScreen;