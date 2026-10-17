import { API_BASE_URL } from '../../config/api';
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
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';



const FollowListScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const { userId, mode } = route.params;

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/${mode}`,
      );
      const data = await response.json();

      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
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

  const title = mode === 'followers' ? 'FOLLOWERS' : 'FOLLOWING';

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {users.length} {users.length === 1 ? 'person' : 'people'}
        </Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadUsers();
            }}
            tintColor={COLORS.accent}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.userCard}
            onPress={() =>
              navigation.navigate('PublicProfile', {
                userId: item.id,
              })
            }
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.username}>@{item.username}</Text>
            </View>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              No {title.toLowerCase()} yet
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
    backgroundColor: COLORS.background,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },

  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.md,
  },

  title: {
    ...TYPOGRAPHY.hero,
    fontSize: 28,
  },

  subtitle: {
    ...TYPOGRAPHY.body,
    marginTop: 4,
  },

  listContent: {
    padding: SPACING.md,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: COLORS.background,
    fontSize: 18,
    fontWeight: '900',
  },

  name: {
    ...TYPOGRAPHY.h3,
    fontSize: 15,
  },

  username: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    marginTop: 2,
  },

  arrow: {
    color: COLORS.textSecondary,
    fontSize: 28,
    fontWeight: '300',
    marginLeft: SPACING.sm,
  },

  empty: {
    paddingVertical: 100,
    alignItems: 'center',
  },

  emptyTitle: {
    ...TYPOGRAPHY.h2,
  },
});

export default FollowListScreen;