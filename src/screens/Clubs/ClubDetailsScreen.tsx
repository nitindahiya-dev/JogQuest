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
    'ClubDetails'
  >;

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'ClubDetails'
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

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const ClubDetailsScreen = () => {
  const route =
    useRoute<Route>();

  const navigation =
    useNavigation<Navigation>();

  const {
    clubId,
  } = route.params;

  const [
    club,
    setClub,
  ] = useState<Club | null>(null);

  const [
    members,
    setMembers,
  ] = useState<Member[]>([]);

  const [
    joined,
    setJoined,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const loadClub =
    useCallback(async () => {
      try {
        setError(null);

        const [
          clubResponse,
          membersResponse,
          membershipResponse,
        ] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/clubs/${clubId}`,
          ),

          fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/members`,
          ),

          fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/membership/${DEV_USER_ID}`,
          ),
        ]);

        const clubData =
          (await clubResponse.json()) as
            | Club
            | { error?: string };

        const membersData =
          (await membersResponse.json()) as
            | Member[]
            | { error?: string };

        const membershipData =
          (await membershipResponse.json()) as {
            joined?: boolean;
            error?: string;
          };

        if (!clubResponse.ok) {
          throw new Error(
            'error' in clubData &&
            clubData.error
              ? clubData.error
              : 'Failed to load club',
          );
        }

        if (!membersResponse.ok) {
          throw new Error(
            'error' in membersData &&
            membersData.error
              ? membersData.error
              : 'Failed to load members',
          );
        }

        if (!membershipResponse.ok) {
          throw new Error(
            membershipData.error ??
              'Failed to load membership',
          );
        }

        setClub(
          clubData as Club,
        );

        setMembers(
          membersData as Member[],
        );

        setJoined(
          membershipData.joined ??
            false,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load club',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      loadClub();
    }, [loadClub]),
  );

  const toggleMembership =
    async () => {
      if (
        !club ||
        actionLoading
      ) {
        return;
      }

      const isOwner =
        club.creator_id ===
        DEV_USER_ID;

      if (
        joined &&
        isOwner
      ) {
        return;
      }

      try {
        setActionLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/clubs/${club.id}/join/${DEV_USER_ID}`,
            {
              method:
                joined
                  ? 'DELETE'
                  : 'POST',
            },
          );

        const data =
          (await response.json()) as {
            joined?: boolean;
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Failed to update membership',
          );
        }

        await loadClub();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to update membership',
        );
      } finally {
        setActionLoading(false);
      }
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

  if (!club) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ??
            'Club unavailable.'}
        </Text>
      </View>
    );
  }

  const isOwner =
    club.creator_id ===
    DEV_USER_ID;

  return (
    <View style={styles.container}>

      <FlatList
        data={members}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() => {
              setRefreshing(true);
              loadClub();
            }}
          />
        }
        contentContainerStyle={
          styles.list
        }

        ListHeaderComponent={
          <View>

            <View style={styles.hero}>

              <View style={styles.clubIcon}>
                <Text style={styles.clubIconText}>
                  C
                </Text>
              </View>

              <Text style={styles.name}>
                {club.name}
              </Text>

              <Text style={styles.description}>
                {club.description ||
                  'No description'}
              </Text>

              <Text style={styles.creator}>
                Created by{' '}
                <Text style={styles.creatorStrong}>
                  @{club.creator_username}
                </Text>
              </Text>

            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            )}

            {!isOwner && (
              <TouchableOpacity
                style={
                  joined
                    ? styles.leaveButton
                    : styles.joinButton
                }
                onPress={
                  toggleMembership
                }
                disabled={actionLoading}>

                {actionLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      joined
                        ? '#fff'
                        : '#000'
                    }
                  />
                ) : (
                  <Text
                    style={
                      joined
                        ? styles.leaveText
                        : styles.joinText
                    }>
                    {joined
                      ? 'LEAVE CLUB'
                      : 'JOIN CLUB'}
                  </Text>
                )}

              </TouchableOpacity>
            )}

            {isOwner && (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerText}>
                  CLUB OWNER
                </Text>
              </View>
            )}

            <View style={styles.statsCard}>

              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {club.members_count}
                </Text>

                <Text style={styles.statLabel}>
                  MEMBERS
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {club.is_public
                    ? 'PUBLIC'
                    : 'PRIVATE'}
                </Text>

                <Text style={styles.statLabel}>
                  VISIBILITY
                </Text>
              </View>

            </View>

            <Text style={styles.membersTitle}>
              Members
            </Text>

          </View>
        }

        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberCard}
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

            <View style={styles.memberInfo}>

              <Text style={styles.memberName}>
                {item.display_name}
              </Text>

              <Text style={styles.memberUsername}>
                @{item.username}
              </Text>

            </View>

            {item.id ===
              club.creator_id && (
              <View
                style={
                  styles.memberOwnerBadge
                }>
                <Text
                  style={
                    styles.memberOwnerText
                  }>
                  OWNER
                </Text>
              </View>
            )}

          </TouchableOpacity>
        )}

        ListEmptyComponent={
          <Text style={styles.emptyMembers}>
            No members yet.
          </Text>
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
    padding: 20,
  },

  list: {
    padding: 14,
    paddingBottom: 35,
  },

  hero: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
  },

  clubIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  clubIconText: {
    color: '#000',
    fontSize: 26,
    fontWeight: '900',
  },

  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },

  description: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },

  creator: {
    color: '#555',
    fontSize: 10,
    marginTop: 12,
  },

  creatorStrong: {
    color: '#aaa',
    fontWeight: '700',
  },

  joinButton: {
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  leaveButton: {
    height: 48,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  joinText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },

  leaveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  ownerBadge: {
    height: 48,
    backgroundColor: '#171717',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  ownerText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '900',
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 18,
    marginTop: 12,
    paddingVertical: 18,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },

  statLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 5,
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  membersTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 22,
    marginBottom: 10,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },

  memberInfo: {
    flex: 1,
    marginLeft: 11,
  },

  memberName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },

  memberUsername: {
    color: '#666',
    fontSize: 10,
    marginTop: 3,
  },

  memberOwnerBadge: {
    backgroundColor: '#1b1b1b',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  memberOwnerText: {
    color: '#888',
    fontSize: 8,
    fontWeight: '900',
  },

  emptyMembers: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 30,
  },

  errorBox: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default ClubDetailsScreen;
