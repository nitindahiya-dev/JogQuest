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
} from '@react-navigation/native';

type NotificationItem = {
  id: string;

  type: string;

  title: string;

  message: string;

  territory_id: string | null;

  challenge_id: string | null;

  activity_id: string | null;

  created_at: string;

  read_at: string | null;
};

type NotificationsResponse = {
  unreadCount: number;
  notifications: NotificationItem[];
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';


const NotificationsScreen = () => {

  const [
    notifications,
    setNotifications,
  ] = useState<NotificationItem[]>([]);

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

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

  const loadNotifications =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/users/${DEV_USER_ID}/notifications`,
          );

        const data =
          (await response.json()) as
            | NotificationsResponse
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data && data.error
              ? data.error
              : 'Failed to load notifications',
          );
        }

        setNotifications(
          (data as NotificationsResponse).notifications,
        );

        setUnreadCount(
          (data as NotificationsResponse).unreadCount,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load notifications',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications]),
  );

  const markRead = async (
    notification: NotificationItem,
  ) => {
    if (notification.read_at) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/notifications/${notification.id}/read`,
          {
            method: 'PATCH',
          },
        );

      if (!response.ok) {
        throw new Error(
          'Failed to mark notification as read',
        );
      }

      setNotifications(
        current =>
          current.map(item =>
            item.id === notification.id
              ? {
                  ...item,
                  read_at:
                    new Date().toISOString(),
                }
              : item,
          ),
      );

      setUnreadCount(
        current =>
          Math.max(current - 1, 0),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to mark notification as read',
      );
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/users/${DEV_USER_ID}/notifications/read-all`,
          {
            method: 'PATCH',
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Failed to mark all notifications as read',
        );
      }

      const now =
        new Date().toISOString();

      setNotifications(
        current =>
          current.map(item => ({
            ...item,
            read_at:
              item.read_at ?? now,
          })),
      );

      setUnreadCount(0);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to mark all notifications as read',
      );
    }
  };

  const formatDate = (
    value: string,
  ) => {
    return new Date(value).toLocaleString();
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
            Notifications
          </Text>

          <Text style={styles.subtitle}>
            {unreadCount} unread
          </Text>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.readAllButton}
            onPress={markAllRead}>
            <Text style={styles.readAllText}>
              MARK ALL READ
            </Text>
          </TouchableOpacity>
        )}

      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No notifications
          </Text>

          <Text style={styles.emptyText}>
            Territory activity and challenge
            updates will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotifications();
              }}
              tintColor="#fff"
            />
          }
          contentContainerStyle={
            styles.listContent
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                markRead(item)
              }
              style={[
                styles.card,
                !item.read_at &&
                  styles.unreadCard,
              ]}>

              <View style={styles.cardTop}>

                <View style={styles.icon}>
                  <Text style={styles.iconText}>
                    !
                  </Text>
                </View>

                <View style={styles.cardBody}>

                  <View style={styles.titleRow}>
                    <Text
                      style={styles.cardTitle}
                      numberOfLines={1}>
                      {item.title}
                    </Text>

                    {!item.read_at && (
                      <View
                        style={
                          styles.unreadDot
                        }
                      />
                    )}
                  </View>

                  <Text
                    style={styles.message}>
                    {item.message}
                  </Text>

                  <Text
                    style={styles.time}>
                    {formatDate(
                      item.created_at,
                    )}
                  </Text>

                </View>

              </View>

            </TouchableOpacity>
          )}
        />
      )}

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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },

  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },

  subtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },

  readAllButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  readAllText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },

  unreadCard: {
    borderColor: '#444',
    backgroundColor: '#151515',
  },

  cardTop: {
    flexDirection: 'row',
  },

  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  iconText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },

  cardBody: {
    flex: 1,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  cardTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginLeft: 8,
  },

  message: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  time: {
    color: '#666',
    fontSize: 10,
    marginTop: 8,
  },

  errorBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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

export default NotificationsScreen;