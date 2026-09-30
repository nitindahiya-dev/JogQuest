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
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Route =
  RouteProp<
    RootStackParamList,
    'FollowList'
  >;

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'FollowList'
  >;

type User = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const FollowListScreen = () => {
  const route =
    useRoute<Route>();

  const navigation =
    useNavigation<Navigation>();

  const {
    userId,
    mode,
  } = route.params;

  const [
    users,
    setUsers,
  ] = useState<User[]>([]);

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

  const loadUsers =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/users/${userId}/${mode}`,
          );

        const data =
          (await response.json()) as
            | User[]
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data &&
            data.error
              ? data.error
              : 'Failed to load users',
          );
        }

        setUsers(
          data as User[],
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load users',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [mode, userId]);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers]),
  );

  const title =
    mode === 'followers'
      ? 'Followers'
      : 'Following';

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
        <Text style={styles.title}>
          {title}
        </Text>

        <Text style={styles.count}>
          {users.length}{' '}
          {users.length === 1
            ? 'person'
            : 'people'}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={users}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() => {
              setRefreshing(true);
              loadUsers();
            }}
          />
        }
        contentContainerStyle={
          users.length === 0
            ? styles.emptyList
            : styles.list
        }
        renderItem={({
          item,
        }) => (
          <TouchableOpacity
            style={styles.userCard}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate(
                'PublicProfile',
                {
                  userId: item.id,
                },
              )
            }>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.display_name
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.name}>
                {item.display_name}
              </Text>

              <Text style={styles.username}>
                @{item.username}
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
              No {title.toLowerCase()} yet
            </Text>

            <Text style={styles.emptyText}>
              When people appear here,
              you'll see them in this list.
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
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },

  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },

  count: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },

  list: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },

  emptyList: {
    flexGrow: 1,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 15,
    padding: 13,
    marginBottom: 9,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '900',
  },

  userInfo: {
    flex: 1,
    marginLeft: 12,
  },

  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  username: {
    color: '#666',
    fontSize: 11,
    marginTop: 3,
  },

  arrow: {
    color: '#666',
    fontSize: 24,
    fontWeight: '300',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
  },

  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default FollowListScreen;
