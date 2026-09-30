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
    'Competitions'
  >;

type Competition = {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  metric: 'DISTANCE' | 'TERRITORY' | 'ACTIVITIES';
  start_at: string;
  end_at: string;
  is_public: boolean;
  created_at: string;
  creator_username: string;
  creator_display_name: string;
  participants_count: number;
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const CompetitionsScreen = () => {
  const navigation =
    useNavigation<Navigation>();

  const [
    competitions,
    setCompetitions,
  ] = useState<Competition[]>([]);

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

  const loadCompetitions =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/competitions`,
          );

        const data =
          (await response.json()) as
            | Competition[]
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data &&
            data.error
              ? data.error
              : 'Failed to load competitions',
          );
        }

        setCompetitions(
          data as Competition[],
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load competitions',
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

  const formatDate = (
    value: string,
  ) => {
    return new Date(
      value,
    ).toLocaleDateString(
      'en-IN',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    );
  };

  const metricLabel = (
    metric: Competition['metric'],
  ) => {
    if (metric === 'DISTANCE') {
      return 'DISTANCE';
    }

    if (metric === 'TERRITORY') {
      return 'TERRITORY';
    }

    return 'ACTIVITIES';
  };

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
            Competitions
          </Text>

          <Text style={styles.subtitle}>
            Compete with the JogQuest community
          </Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() =>
            navigation.navigate(
              'CreateCompetition',
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
        data={competitions}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() => {
              setRefreshing(true);
              loadCompetitions();
            }}
          />
        }
        contentContainerStyle={
          competitions.length === 0
            ? styles.emptyList
            : styles.list
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate(
                'CompetitionDetails',
                {
                  competitionId:
                    item.id,
                },
              )
            }>

            <View style={styles.icon}>
              <Text style={styles.iconText}>
                C
              </Text>
            </View>

            <View style={styles.body}>

              <View style={styles.titleRow}>

                <Text
                  style={styles.name}
                  numberOfLines={1}>
                  {item.name}
                </Text>

                <View
                  style={[
                    styles.status,
                    item.status === 'ACTIVE' &&
                      styles.statusActive,
                    item.status === 'UPCOMING' &&
                      styles.statusUpcoming,
                  ]}>
                  <Text
                    style={
                      styles.statusText
                    }>
                    {item.status}
                  </Text>
                </View>

              </View>

              <Text
                style={styles.description}
                numberOfLines={2}>
                {item.description ||
                  'No description'}
              </Text>

              <View style={styles.metaRow}>

                <Text style={styles.meta}>
                  {metricLabel(
                    item.metric,
                  )}
                </Text>

                <Text style={styles.meta}>
                  {item.participants_count}{' '}
                  participants
                </Text>

              </View>

              <Text style={styles.dates}>
                {formatDate(item.start_at)}
                {'  →  '}
                {formatDate(item.end_at)}
              </Text>

            </View>

            <Text style={styles.arrow}>
              ›
            </Text>

          </TouchableOpacity>
        )}

        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              No competitions yet
            </Text>

            <Text style={styles.emptyText}>
              Create the first community
              competition.
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
    padding: 14,
    paddingBottom: 30,
  },

  emptyList: {
    flexGrow: 1,
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

  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },

  body: {
    flex: 1,
    marginLeft: 12,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  name: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  status: {
    backgroundColor: '#222',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginLeft: 7,
  },

  statusActive: {
    backgroundColor: '#fff',
  },

  statusUpcoming: {
    backgroundColor: '#333',
  },

  statusText: {
    color: '#000',
    fontSize: 7,
    fontWeight: '900',
  },

  description: {
    color: '#888',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },

  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },

  meta: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
  },

  dates: {
    color: '#666',
    fontSize: 9,
    marginTop: 6,
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
    paddingTop: 110,
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
  },
});

export default CompetitionsScreen;
