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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';

const API_BASE_URL = 'http://127.0.0.1:4000';

const NotificationsScreen = () => {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();

  const userId = user?.id;

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/notifications`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to load notifications: ${response.status}`);
      }

      const data = await response.json();

      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, token]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications]),
  );

  const markAllRead = async () => {
    if (unreadCount === 0 || !userId) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/notifications/read-all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to mark notifications as read: ${response.status}`);
      }

      setNotifications(prev =>
        prev.map(notification => ({
          ...notification,
          read_at: notification.read_at ?? new Date().toISOString(),
        })),
      );

      setUnreadCount(0);
    } catch (e) {
      console.error('Failed to mark notifications as read:', e);
    }
  };

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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>NOTIFICATIONS</Text>
          <Text style={styles.subtitle}>{unreadCount} unread</Text>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.readAllBtn}
            onPress={markAllRead}
            activeOpacity={0.8}
          >
            <Text style={styles.readAllBtnText}>MARK ALL READ</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
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
              loadNotifications();
            }}
            tintColor={COLORS.accent}
          />
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              !item.read_at && styles.unreadCard,
            ]}
          >
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>!</Text>
            </View>

            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                {!item.read_at && <View style={styles.unreadDot} />}
              </View>

              <Text style={styles.message}>{item.message}</Text>

              <Text style={styles.time}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Notifications</Text>

            <Text style={styles.emptyText}>
              Activity and updates will appear here.
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
    flexDirection: 'row',
    alignItems: 'center',
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

  readAllBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  readAllBtnText: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
  },

  listContent: {
    padding: SPACING.md,
    flexGrow: 1,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  unreadCard: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212, 255, 0, 0.03)',
  },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '900',
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  cardTitle: {
    flex: 1,
    ...TYPOGRAPHY.h3,
    fontSize: 14,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginLeft: SPACING.sm,
    ...SHADOWS.glow,
  },

  message: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    marginTop: 6,
  },

  time: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    marginTop: 8,
  },

  empty: {
    flex: 1,
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    ...TYPOGRAPHY.h2,
  },

  emptyText: {
    ...TYPOGRAPHY.body,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});

export default NotificationsScreen;