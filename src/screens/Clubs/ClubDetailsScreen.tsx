import { API_BASE_URL } from '../../config/api';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
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
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Route = RouteProp<RootStackParamList, 'ClubDetails'>;
type Navigation = NativeStackNavigationProp<
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

type ClubJoinRequest = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
};

type SelectedClubPostMedia = {
  uri: string;
  name: string;
  type: string;
  mediaKind: 'image' | 'video';
};

type ClubPostComment = {
  id: string;
  post_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type MemberRole = 'owner' | 'admin' | 'member';

type Member = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
  role?: MemberRole;
};



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

const ClubDetailsScreen = () => {
  const { user, token } = useAuth();
  const userId = user?.id;

  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const { clubId } = route.params;

  const [club, setClub] = useState<Club | null>(null);
  const [clubSettingsVisible, setClubSettingsVisible] = useState(false);
  const [clubSettingsName, setClubSettingsName] = useState('');
  const [clubSettingsDescription, setClubSettingsDescription] = useState('');
  const [clubSettingsPublic, setClubSettingsPublic] = useState(true);
  const [clubSettingsSaving, setClubSettingsSaving] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] =
    useState<'all' | 'owner' | 'admin' | 'member'>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [clubPosts, setClubPosts] = useState<any[]>([]);
  const [clubPostText, setClubPostText] = useState('');
  const [clubPostLoading, setClubPostLoading] = useState(false);
  const [selectedClubMedia, setSelectedClubMedia] =
    useState<SelectedClubPostMedia | null>(null);
  const [clubPostComments, setClubPostComments] = useState<
    Record<string, ClubPostComment[]>
  >({});
  const [activeClubCommentsPostId, setActiveClubCommentsPostId] =
    useState<string | null>(null);
  const [clubCommentText, setClubCommentText] = useState('');
  const [clubCommentLoading, setClubCommentLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClub = useCallback(async () => {
    if (!userId) {
      setError('Please log in to view membership.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const [
        clubResponse,
        membersResponse,
        membershipResponse,
        rolesResponse,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/clubs/${clubId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(`${API_BASE_URL}/api/clubs/${clubId}/members`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(
          `${API_BASE_URL}/api/clubs/${clubId}/membership/${userId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        ),
        fetch(`${API_BASE_URL}/api/clubs/${clubId}/roles`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      const clubData = (await clubResponse.json()) as
        | Club
        | { error?: string };

      const membersData = (await membersResponse.json()) as
        | Member[]
        | { error?: string };

      const membershipData = (await membershipResponse.json()) as {
        joined?: boolean;
        error?: string;
      };

      const rolesPayload: unknown = await rolesResponse
        .json()
        .catch(() => []);

      const roleByUserId = new Map<string, MemberRole>();

      if (Array.isArray(rolesPayload)) {
        for (const entry of rolesPayload) {
          if (
            entry &&
            typeof entry.id === 'string' &&
            (entry.role === 'owner' ||
              entry.role === 'admin' ||
              entry.role === 'member')
          ) {
            roleByUserId.set(entry.id, entry.role);
          }
        }
      }

      if (!clubResponse.ok) {
        throw new Error(
          'error' in clubData && clubData.error
            ? clubData.error
            : 'Failed to load club',
        );
      }

      if (!membershipResponse.ok) {
        throw new Error(
          membershipData.error ?? 'Failed to load membership',
        );
      }

      const loadedClub = clubData as Club;
      setClub(loadedClub);
      setClubSettingsName(loadedClub.name);
      setClubSettingsDescription(loadedClub.description || '');
      setClubSettingsPublic(loadedClub.is_public);
      const loadedMembers =
        membersResponse.ok && Array.isArray(membersData)
          ? (membersData as Member[])
          : [];

      setMembers(
        loadedMembers.map(member => ({
          ...member,
          role:
            roleByUserId.get(member.id) ??
            (member.id === loadedClub.creator_id ? 'owner' : undefined),
        })),
      );

      setJoined(membershipData.joined ?? false);

      const clubPostsResponse = await fetch(
        `${API_BASE_URL}/api/clubs/${clubId}/posts`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const clubPostsData = await clubPostsResponse.json().catch(() => []);
      if (clubPostsResponse.ok && Array.isArray(clubPostsData)) {
        setClubPosts(clubPostsData);
      } else {
        setClubPosts([]);
      }

      const currentRole =
        roleByUserId.get(userId) ??
        (loadedClub.creator_id === userId ? 'owner' : undefined);

      const canManageRequests =
        currentRole === 'owner' || currentRole === 'admin';

      if (!loadedClub.is_public && token && userId) {
        if (canManageRequests) {
          const requestsResponse = await fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/requests`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const requestData = await requestsResponse.json();
          if (requestsResponse.ok && Array.isArray(requestData)) {
            setJoinRequests(requestData as ClubJoinRequest[]);
          } else {
            setJoinRequests([]);
          }
          setRequestStatus(null);
        } else {
          const requestResponse = await fetch(
            `${API_BASE_URL}/api/clubs/${clubId}/requests/me`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const requestData = (await requestResponse.json()) as {
            status?: string | null;
            error?: string;
          };
          if (requestResponse.ok) {
            setRequestStatus(requestData.status ?? null);
          }
          setJoinRequests([]);
        }
      } else {
        setRequestStatus(null);
        setJoinRequests([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load club',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubId, userId, token]);

  useFocusEffect(
    useCallback(() => {
      loadClub();
    }, [loadClub]),
  );


  const saveClubSettings = async () => {
    if (!club || !token || !isOwner || clubSettingsSaving) return;

    const name = clubSettingsName.trim();
    const description = clubSettingsDescription.trim();

    if (!name) {
      setError('Club name is required.');
      return;
    }
    if (name.length > 100 || description.length > 500) {
      setError('Name must be 100 characters or less and description 500 or less.');
      return;
    }

    try {
      setClubSettingsSaving(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/settings`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description,
            is_public: clubSettingsPublic,
          }),
        },
      );

      const data = await response.json() as Club | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Could not update club settings',
        );
      }

      const updatedClub = data as Club;
      setClub(current => current ? { ...current, ...updatedClub } : current);
      setClubSettingsVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update club settings');
    } finally {
      setClubSettingsSaving(false);
    }
  };


  const transferClubOwnership = (member: Member) => {
    if (!club || !token || !isOwner || actionLoading) return;

    Alert.alert(
      'Transfer club ownership',
      `Transfer ownership of ${club.name} to ${member.display_name || member.username}? You will become an admin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer ownership',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              setError(null);

              const response = await fetch(
                `${API_BASE_URL}/api/clubs/${club.id}/transfer-ownership`,
                {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ newOwnerId: member.id }),
                },
              );

              const data = await response.json() as { error?: string };

              if (!response.ok) {
                throw new Error(data.error ?? 'Could not transfer ownership');
              }

              await loadClub();
              setClubSettingsVisible(false);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : 'Could not transfer ownership',
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const deleteClub = async () => {
    if (
      !club ||
      !token ||
      !isOwner ||
      actionLoading ||
      deleteConfirmation !== club.name
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ confirmation: deleteConfirmation }),
        },
      );

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not delete club');
      }

      navigation.goBack();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not delete club',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const chooseClubPostMedia = async () => {
    if (clubPostLoading) return;

    try {
      const picker = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: 1,
        videoQuality: 'medium',
        includeExtra: false,
      });

      if (picker.didCancel) return;

      const asset = picker.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Media unavailable', 'Please select another image or video.');
        return;
      }

      const kind = asset.type?.startsWith('video/') ? 'video' : 'image';
      const maxSize = kind === 'video' ? 50 : 10;

      if (asset.fileSize && asset.fileSize > maxSize * 1024 * 1024) {
        Alert.alert(
          'Media too large',
          `Choose a ${kind} smaller than ${maxSize} MB.`,
        );
        return;
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
      ];

      if (!allowedTypes.includes(asset.type || '')) {
        Alert.alert(
          'Unsupported media',
          'Use JPEG, PNG, WebP, MP4, or MOV.',
        );
        return;
      }

      setSelectedClubMedia({
        uri: asset.uri,
        name: asset.fileName ||
          `${kind}.${asset.type?.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg')}`,
        type: asset.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        mediaKind: kind,
      });
    } catch {
      Alert.alert('Media picker error', 'Could not open your media library.');
    }
  };

  const createClubPost = async () => {
    const content = clubPostText.trim();

    if (
      !club ||
      !token ||
      !joined ||
      (!content && !selectedClubMedia) ||
      clubPostLoading
    ) return;

    try {
      setClubPostLoading(true);
      setError(null);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      let body: any;

      if (selectedClubMedia) {
        const formData = new FormData();
        formData.append('content', content);
        formData.append('media', {
          uri: selectedClubMedia.uri,
          name: selectedClubMedia.name,
          type: selectedClubMedia.type,
        } as any);
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ content });
      }

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/posts`,
        {
          method: 'POST',
          headers,
          body,
        },
      );

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not publish club post');
      }

      setClubPostText('');
      setSelectedClubMedia(null);
      await loadClub();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not publish club post',
      );
    } finally {
      setClubPostLoading(false);
    }
  };

  const toggleClubPostLike = async (post: any) => {
    if (!token || !userId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${post.id}/like/${userId}`,
        {
          method: post.liked_by_me ? 'DELETE' : 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error('Could not update like');

      setClubPosts(current => current.map(item =>
        item.id === post.id
          ? {
              ...item,
              liked_by_me: !item.liked_by_me,
              likes_count: Math.max(
                0,
                Number(item.likes_count) + (item.liked_by_me ? -1 : 1),
              ),
            }
          : item,
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update like');
    }
  };

  const loadClubPostComments = async (
    postId: string,
  ): Promise<ClubPostComment[] | null> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
      );
      const data = await response.json() as
        | ClubPostComment[]
        | { error?: string };

      if (!response.ok || !Array.isArray(data)) {
        throw new Error(
          !Array.isArray(data) && data.error
            ? data.error
            : 'Failed to load comments',
        );
      }

      setClubPostComments(current => ({
        ...current,
        [postId]: data,
      }));

      return data;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load comments',
      );
      return null;
    }
  };

  const toggleClubPostComments = async (postId: string) => {
    if (activeClubCommentsPostId === postId) {
      setActiveClubCommentsPostId(null);
      setClubCommentText('');
      return;
    }

    setActiveClubCommentsPostId(postId);
    setClubCommentText('');
    await loadClubPostComments(postId);
  };

  const submitClubPostComment = async (postId: string) => {
    const comment = clubCommentText.trim();

    if (!token || !userId || !comment || clubCommentLoading) return;

    try {
      setClubCommentLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, comment }),
        },
      );

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to submit comment');
      }

      setClubCommentText('');

      const refreshedComments = await loadClubPostComments(postId);

      if (refreshedComments !== null) {
        setClubPosts(current =>
          current.map(post =>
            post.id === postId
              ? { ...post, comments_count: refreshedComments.length }
              : post,
          ),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to submit comment',
      );
    } finally {
      setClubCommentLoading(false);
    }
  };

  const toggleMembership = async () => {
    if (!userId || !club || actionLoading) return;

    const isOwner = club.creator_id === userId;
    if (joined && isOwner) return;

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/join/${userId}`,
        {
          method: joined ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = (await response.json()) as {
        joined?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Failed to update membership',
        );
      }

      await loadClub();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update membership',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const submitJoinRequest = async () => {
    if (!club || !token || actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/requests`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'Could not request to join');
      setRequestStatus(data.status ?? 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request to join');
    } finally {
      setActionLoading(false);
    }
  };

  const reviewJoinRequest = async (
    requestId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!club || !token || actionLoading) return;
    try {
      setActionLoading(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/requests/${requestId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not review request');
      await loadClub();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not review request');
    } finally {
      setActionLoading(false);
    }
  };

  const updateMemberRole = async (
    memberId: string,
    role: 'admin' | 'member',
  ) => {
    if (!club || !token || actionLoading) return;

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/clubs/${club.id}/members/${memberId}/role`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not update member role');
      }

      await loadClub();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update member role',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const removeClubMember = (member: Member) => {
    if (!club || !token || actionLoading) return;

    Alert.alert(
      'Remove club member',
      `Remove ${member.display_name || member.username} from ${club.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              setError(null);

              const response = await fetch(
                `${API_BASE_URL}/api/clubs/${club.id}/members/${member.id}`,
                {
                  method: 'DELETE',
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );

              const data = (await response.json()) as {
                error?: string;
              };

              if (!response.ok) {
                throw new Error(data.error ?? 'Could not remove member');
              }

              await loadClub();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : 'Could not remove member',
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

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

  if (!club) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text style={styles.errorText}>
          {error ?? 'Club unavailable.'}
        </Text>
      </View>
    );
  }

  const isOwner = !!userId && club.creator_id === userId;
  const currentMember = members.find(member => member.id === userId);
  const isAdmin = !isOwner && currentMember?.role === 'admin';
  const canManageRequests = isOwner || isAdmin;

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter(member => {
    const matchesSearch =
      !normalizedMemberSearch ||
      (member.display_name || '').toLowerCase().includes(normalizedMemberSearch) ||
      (member.username || '').toLowerCase().includes(normalizedMemberSearch);

    const matchesRole =
      memberRoleFilter === 'all' ||
      (member.role ?? 'member') === memberRoleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredMembers}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadClub();
            }}
          />
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 40 },
        ]}
        ListHeaderComponent={
          <View>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Text style={styles.heroIconText}>
                  {club.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              <Text style={styles.heroName}>{club.name}</Text>

              <Text style={styles.heroDescription}>
                {club.description || 'No description'}
              </Text>

              <Text style={styles.heroCreator}>
                Created by{' '}
                <Text style={{ color: COLORS.accent }}>
                  @{club.creator_username}
                </Text>
              </Text>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Membership / private join request */}
            {!isOwner && (club.is_public || joined) && (
              <TouchableOpacity
                style={[styles.actionBtn, joined && styles.actionBtnLeave]}
                onPress={toggleMembership}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator color={joined ? COLORS.text : COLORS.background} />
                ) : (
                  <Text style={[styles.actionBtnText, joined && styles.actionBtnTextLeave]}>
                    {joined ? 'LEAVE CLUB' : 'JOIN CLUB'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {!isOwner && !club.is_public && !joined && (
              <TouchableOpacity
                style={[styles.actionBtn, requestStatus === 'pending' && styles.actionBtnLeave]}
                onPress={submitJoinRequest}
                disabled={actionLoading || requestStatus === 'pending'}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.actionBtnText}>
                    {requestStatus === 'pending'
                      ? 'REQUEST PENDING'
                      : requestStatus === 'rejected'
                        ? 'REQUEST AGAIN'
                        : 'REQUEST TO JOIN'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {isOwner && (
              <View style={styles.ownerBanner}>
                <Text style={styles.ownerBannerText}>
                  ⚡ YOU ARE THE OWNER
                </Text>
              </View>
            )}

            {isAdmin && (
              <View style={styles.adminBanner}>
                <Text style={styles.adminBannerText}>
                  CLUB ADMIN
                </Text>
              </View>
            )}

            {!club.is_public && canManageRequests && (
              <View style={styles.requestsPanel}>
                <Text style={styles.sectionTitle}>PENDING JOIN REQUESTS</Text>
                {joinRequests.length === 0 ? (
                  <Text style={styles.emptyText}>No pending requests.</Text>
                ) : joinRequests.map(request => (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>
                        {request.display_name || request.username}
                      </Text>
                      <Text style={styles.memberUsername}>@{request.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.approveButton}
                      disabled={actionLoading}
                      onPress={() => reviewJoinRequest(request.id, 'approved')}
                    >
                      <Text style={styles.reviewButtonText}>APPROVE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      disabled={actionLoading}
                      onPress={() => reviewJoinRequest(request.id, 'rejected')}
                    >
                      <Text style={styles.reviewButtonText}>REJECT</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {isOwner && (
              <View style={styles.settingsPanel}>
                <View style={styles.settingsHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsTitle}>CLUB SETTINGS</Text>
                    <Text style={styles.settingsSubtitle}>
                      Manage your club information and visibility
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.settingsToggle}
                    onPress={() => setClubSettingsVisible(value => !value)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.settingsToggleText}>
                      {clubSettingsVisible ? 'CLOSE' : 'EDIT'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {clubSettingsVisible && (
                  <View style={styles.settingsForm}>
                    <Text style={styles.settingsLabel}>CLUB NAME</Text>
                    <TextInput
                      value={clubSettingsName}
                      onChangeText={setClubSettingsName}
                      maxLength={100}
                      placeholder="Club name"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.settingsInput}
                    />

                    <Text style={styles.settingsLabel}>DESCRIPTION</Text>
                    <TextInput
                      value={clubSettingsDescription}
                      onChangeText={setClubSettingsDescription}
                      maxLength={500}
                      multiline
                      textAlignVertical="top"
                      placeholder="Describe your club"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.settingsInput, styles.settingsDescription]}
                    />

                    <Text style={styles.settingsLabel}>VISIBILITY</Text>
                    <View style={styles.settingsVisibilityRow}>
                      <TouchableOpacity
                        style={[
                          styles.settingsVisibilityOption,
                          clubSettingsPublic && styles.settingsVisibilitySelected,
                        ]}
                        onPress={() => setClubSettingsPublic(true)}
                      >
                        <Text style={[
                          styles.settingsVisibilityText,
                          clubSettingsPublic && styles.settingsVisibilityTextSelected,
                        ]}>PUBLIC</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.settingsVisibilityOption,
                          !clubSettingsPublic && styles.settingsVisibilitySelected,
                        ]}
                        onPress={() => setClubSettingsPublic(false)}
                      >
                        <Text style={[
                          styles.settingsVisibilityText,
                          !clubSettingsPublic && styles.settingsVisibilityTextSelected,
                        ]}>PRIVATE</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.settingsHint}>
                      Private clubs require approval for new members. Existing members are not removed when visibility changes.
                    </Text>

                    <TouchableOpacity
                      style={styles.settingsSaveButton}
                      onPress={saveClubSettings}
                      disabled={clubSettingsSaving}
                    >
                      {clubSettingsSaving ? (
                        <ActivityIndicator color={COLORS.background} />
                      ) : (
                        <Text style={styles.settingsSaveText}>SAVE SETTINGS</Text>
                      )}
                    </TouchableOpacity>

                    <Text
                      style={[
                        styles.settingsLabel,
                        { color: COLORS.danger, marginTop: 28 },
                      ]}
                    >
                      DANGER ZONE — DELETE CLUB
                    </Text>
                    <Text style={styles.settingsHint}>
                      This permanently deletes this club, its memberships,
                      join requests, club posts, comments and likes.
                      This action cannot be undone.
                    </Text>
                    <Text style={styles.settingsLabel}>
                      TYPE "{club.name}" TO CONFIRM
                    </Text>
                    <TextInput
                      value={deleteConfirmation}
                      onChangeText={setDeleteConfirmation}
                      placeholder="Enter the exact club name"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                      style={[
                        styles.settingsInput,
                        { borderColor: COLORS.danger },
                      ]}
                    />
                    <TouchableOpacity
                      style={[
                        styles.settingsSaveButton,
                        {
                          backgroundColor: COLORS.danger,
                          opacity:
                            deleteConfirmation === club.name && !actionLoading
                              ? 1
                              : 0.4,
                        },
                      ]}
                      onPress={deleteClub}
                      disabled={
                        deleteConfirmation !== club.name || actionLoading
                      }
                    >
                      {actionLoading ? (
                        <ActivityIndicator color={COLORS.text} />
                      ) : (
                        <Text style={[styles.settingsSaveText, { color: COLORS.text }]}>
                          DELETE CLUB PERMANENTLY
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {club.members_count}
                </Text>
                <Text style={styles.statLabel}>MEMBERS</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {club.is_public ? 'PUBLIC' : 'PRIVATE'}
                </Text>
                <Text style={styles.statLabel}>VISIBILITY</Text>
              </View>
            </View>


            {/* CLUB FEED */}
            <Text style={styles.sectionTitle}>CLUB FEED</Text>

            {joined && (
              <View style={styles.clubComposer}>
                <TextInput
                  value={clubPostText}
                  onChangeText={setClubPostText}
                  placeholder="Share something with your club..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  maxLength={500}
                  style={styles.clubPostInput}
                />
                {selectedClubMedia && (
                  <View style={styles.clubMediaPreview}>
                    {selectedClubMedia.mediaKind === 'image' ? (
                      <Image
                        source={{ uri: selectedClubMedia.uri }}
                        resizeMode="cover"
                        style={styles.clubMediaPreviewImage}
                      />
                    ) : (
                      <Text style={styles.clubMediaSelectedText}>
                        VIDEO SELECTED: {selectedClubMedia.name}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => setSelectedClubMedia(null)}
                      style={styles.clubMediaRemove}
                      disabled={clubPostLoading}
                    >
                      <Text style={styles.clubMediaRemoveText}>REMOVE MEDIA</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  onPress={chooseClubPostMedia}
                  disabled={clubPostLoading}
                  style={styles.clubMediaPicker}
                >
                  <Text style={styles.clubMediaPickerText}>
                    + Attach photo or video
                  </Text>
                </TouchableOpacity>

                <View style={styles.clubComposerFooter}>
                  <Text style={styles.clubPostCount}>{clubPostText.length}/500</Text>
                  <TouchableOpacity
                    style={styles.clubPostButton}
                    onPress={createClubPost}
                    disabled={
                      clubPostLoading ||
                      (!clubPostText.trim() && !selectedClubMedia)
                    }
                  >
                    {clubPostLoading
                      ? <ActivityIndicator size="small" color={COLORS.background} />
                      : <Text style={styles.clubPostButtonText}>POST</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {clubPosts.length === 0 ? (
              <Text style={styles.emptyText}>
                No club posts yet. Share the first update.
              </Text>
            ) : clubPosts.map(post => (
              <View key={post.id} style={styles.clubPostCard}>
                <Text style={styles.clubPostAuthor}>
                  {post.display_name || post.username || 'JogQuest member'}
                </Text>
                <Text style={styles.clubPostUsername}>@{post.username}</Text>
                {!!post.content && (
                  <Text style={styles.clubPostContent}>{post.content}</Text>
                )}

                {!!post.media_url && post.media_type === 'image' && (
                  <Image
                    source={{ uri: post.media_url }}
                    resizeMode="cover"
                    style={styles.clubPostImage}
                  />
                )}

                {!!post.media_url && post.media_type === 'video' && (
                  <View style={styles.clubPostVideoContainer}>
                    <Video
                      source={{ uri: post.media_url }}
                      style={styles.clubPostVideo}
                      controls
                      paused
                      resizeMode="contain"
                      playInBackground={false}
                      playWhenInactive={false}
                      onError={() => setError('Unable to play this club video.')}
                    />
                  </View>
                )}
                <View style={styles.clubPostActions}>
                  <TouchableOpacity
                    onPress={() => toggleClubPostLike(post)}
                    style={styles.clubPostLike}
                  >
                    <Text style={[
                      styles.clubPostActionText,
                      post.liked_by_me && { color: COLORS.danger },
                    ]}>
                      {post.liked_by_me ? '♥' : '♡'} {post.likes_count ?? 0}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleClubPostComments(post.id)}
                    style={styles.clubPostCommentToggle}
                  >
                    <Text style={styles.clubPostActionText}>
                      {activeClubCommentsPostId === post.id ? 'Hide' : 'View'} comments ({post.comments_count ?? 0})
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.clubPostTime}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {activeClubCommentsPostId === post.id && (
                  <View style={styles.clubCommentsSection}>
                    {(clubPostComments[post.id] ?? []).length === 0 ? (
                      <Text style={styles.clubCommentEmpty}>
                        No comments yet. Start the conversation.
                      </Text>
                    ) : (
                      (clubPostComments[post.id] ?? []).map(comment => (
                        <View key={comment.id} style={styles.clubCommentRow}>
                          <Text style={styles.clubCommentAuthor}>
                            {comment.display_name || comment.username || 'JogQuest member'}
                          </Text>
                          <Text style={styles.clubCommentText}>
                            {comment.comment}
                          </Text>
                        </View>
                      ))
                    )}

                    {joined && (
                      <View style={styles.clubCommentInputRow}>
                        <TextInput
                          value={clubCommentText}
                          onChangeText={setClubCommentText}
                          placeholder="Write a comment..."
                          placeholderTextColor={COLORS.textMuted}
                          maxLength={500}
                          style={styles.clubCommentInput}
                        />
                        <TouchableOpacity
                          style={[
                            styles.clubCommentButton,
                            (!clubCommentText.trim() || clubCommentLoading) &&
                              styles.clubCommentButtonDisabled,
                          ]}
                          onPress={() => submitClubPostComment(post.id)}
                          disabled={!clubCommentText.trim() || clubCommentLoading}
                        >
                          {clubCommentLoading ? (
                            <ActivityIndicator
                              size="small"
                              color={COLORS.background}
                            />
                          ) : (
                            <Text style={styles.clubCommentButtonText}>
                              SEND
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}

            <View style={styles.memberDiscoveryHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>MEMBERS</Text>
                <Text style={styles.memberDiscoveryCount}>
                  {filteredMembers.length} of {members.length} members
                </Text>
              </View>
            </View>

            <TextInput
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Search members by name or username"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              returnKeyType="search"
              style={styles.memberSearchInput}
            />

            <View style={styles.memberFilterRow}>
              {([
                ['all', 'ALL'],
                ['owner', 'OWNER'],
                ['admin', 'ADMINS'],
                ['member', 'MEMBERS'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.memberFilterChip,
                    memberRoleFilter === value && styles.memberFilterChipActive,
                  ]}
                  onPress={() => setMemberRoleFilter(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: memberRoleFilter === value }}
                >
                  <Text style={[
                    styles.memberFilterText,
                    memberRoleFilter === value && styles.memberFilterTextActive,
                  ]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberCard}
            activeOpacity={0.85}
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

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.memberName}>
                {item.display_name}
              </Text>
              <Text style={styles.memberUsername}>
                @{item.username}
              </Text>
            </View>

            {item.role === 'owner' && (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeText}>OWNER</Text>
              </View>
            )}

            {item.role === 'admin' && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            )}

            {item.role === 'member' && (
              <View style={styles.memberRoleBadge}>
                <Text style={styles.memberRoleBadgeText}>MEMBER</Text>
              </View>
            )}

            {item.id !== userId && (
              <View style={styles.memberManagement}>
                {isOwner && item.role !== 'owner' && (
                  <TouchableOpacity
                    style={[
                      styles.promoteButton,
                      { borderColor: COLORS.danger },
                    ]}
                    disabled={actionLoading}
                    onPress={() => transferClubOwnership(item)}
                  >
                    <Text style={[
                      styles.promoteButtonText,
                      { color: COLORS.danger },
                    ]}>
                      TRANSFER OWNERSHIP
                    </Text>
                  </TouchableOpacity>
                )}

                {isOwner && item.role === 'member' && (
                  <TouchableOpacity
                    style={styles.promoteButton}
                    disabled={actionLoading}
                    onPress={() => updateMemberRole(item.id, 'admin')}
                  >
                    <Text style={styles.promoteButtonText}>MAKE ADMIN</Text>
                  </TouchableOpacity>
                )}

                {isOwner && item.role === 'admin' && (
                  <TouchableOpacity
                    style={styles.demoteButton}
                    disabled={actionLoading}
                    onPress={() => updateMemberRole(item.id, 'member')}
                  >
                    <Text style={styles.demoteButtonText}>REMOVE ADMIN</Text>
                  </TouchableOpacity>
                )}

                {(
                  (isOwner && item.role !== 'owner') ||
                  (isAdmin && item.role === 'member')
                ) && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    disabled={actionLoading}
                    onPress={() => removeClubMember(item)}
                  >
                    <Text style={styles.removeButtonText}>REMOVE</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {members.length === 0
              ? 'No members yet.'
              : 'No members match this search or filter.'}
          </Text>
        }
      />
    </View>
  );
};

export default ClubDetailsScreen;

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
    padding: 20,
  },

  list: {
    padding: SPACING.md,
  },

  // Hero
  hero: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },

  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroIconText: {
    color: COLORS.background,
    fontSize: 36,
    fontWeight: '900',
  },

  heroName: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },

  heroDescription: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },

  heroCreator: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 12,
  },

  // Actions
  actionBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 14,
  },

  actionBtnLeave: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },

  actionBtnText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  actionBtnTextLeave: {
    color: COLORS.danger,
  },

  ownerBanner: {
    backgroundColor: 'rgba(212, 255, 0, 0.10)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 14,
  },

  ownerBannerText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
  },

  adminBanner: {
    backgroundColor: 'rgba(100, 160, 255, 0.10)',
    borderWidth: 1,
    borderColor: '#649FFF',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 14,
  },

  adminBannerText: {
    color: '#649FFF',
    fontSize: 12,
    fontWeight: '900',
  },

  requestsPanel: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  approveButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
  },
  rejectButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  reviewButtonText: {
    color: COLORS.background,
    fontSize: 9,
    fontWeight: '900',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingVertical: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statBox: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '900',
  },

  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.4,
  },

  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  sectionTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 26,
    marginBottom: 12,
  },


  clubMediaPreview: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
  },
  clubMediaPreviewImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
  },
  clubMediaSelectedText: {
    color: COLORS.accent,
    padding: 14,
    fontWeight: '800',
  },
  clubMediaRemove: {
    paddingTop: 10,
    alignSelf: 'flex-end',
  },
  clubMediaRemoveText: {
    color: COLORS.danger,
    fontWeight: '800',
    fontSize: 11,
  },
  clubMediaPicker: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  clubMediaPickerText: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  clubPostImage: {
    width: '100%',
    height: 280,
    borderRadius: 14,
    marginTop: 12,
    backgroundColor: COLORS.surfaceLight,
  },
  clubPostVideoContainer: {
    marginTop: 12,
    height: 240,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  clubPostVideo: {
    width: '100%',
    height: '100%',
  },

  clubComposer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  clubPostInput: {
    color: COLORS.text,
    minHeight: 70,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  clubComposerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  clubPostCount: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  clubPostButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  clubPostButtonText: {
    color: COLORS.background,
    fontWeight: '900',
    fontSize: 11,
  },
  clubPostCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  clubPostAuthor: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 14,
  },
  clubPostUsername: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  clubPostContent: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  clubPostActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 12,
    paddingTop: 10,
  },
  clubPostLike: {
    paddingVertical: 4,
  },
  clubPostActionText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  clubPostTime: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginLeft: 'auto',
  },

  clubPostCommentToggle: {
    paddingVertical: 4,
  },
  clubCommentsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  clubCommentEmpty: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  clubCommentRow: {
    marginBottom: 12,
  },
  clubCommentAuthor: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  clubCommentText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  clubCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  clubCommentInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    color: COLORS.text,
    minHeight: 42,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  clubCommentButton: {
    marginLeft: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  clubCommentButtonDisabled: {
    opacity: 0.45,
  },
  clubCommentButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
  },

  // Members
  settingsPanel: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  settingsSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  settingsToggle: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  settingsToggleText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  settingsForm: {
    marginTop: 16,
  },
  settingsLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 7,
    marginTop: 12,
  },
  settingsInput: {
    color: COLORS.text,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
  },
  settingsDescription: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  settingsVisibilityRow: {
    flexDirection: 'row',
    gap: 9,
  },
  settingsVisibilityOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceLight,
  },
  settingsVisibilitySelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212, 255, 0, 0.10)',
  },
  settingsVisibilityText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  settingsVisibilityTextSelected: {
    color: COLORS.accent,
  },
  settingsHint: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 9,
  },
  settingsSaveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  settingsSaveText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
  },
  memberDiscoveryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  memberDiscoveryCount: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginBottom: 12,
  },
  memberSearchInput: {
    color: COLORS.text,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 13,
    marginBottom: 10,
  },
  memberFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 12,
  },
  memberFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  memberFilterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  memberFilterText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '900',
  },
  memberFilterTextActive: {
    color: COLORS.background,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    fontSize: 17,
    fontWeight: '900',
  },

  memberName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },

  memberUsername: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  ownerBadge: {
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  ownerBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '900',
  },

  adminBadge: {
    backgroundColor: 'rgba(100, 160, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  adminBadgeText: {
    color: '#649FFF',
    fontSize: 9,
    fontWeight: '900',
  },

  memberRoleBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  memberRoleBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '900',
  },

  memberManagement: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 8,
  },

  promoteButton: {
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
  },

  promoteButtonText: {
    color: COLORS.accent,
    fontSize: 8,
    fontWeight: '900',
  },

  demoteButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
  },

  demoteButtonText: {
    color: COLORS.textSecondary,
    fontSize: 8,
    fontWeight: '900',
  },

  removeButton: {
    backgroundColor: 'rgba(255, 77, 77, 0.10)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
  },

  removeButtonText: {
    color: COLORS.danger,
    fontSize: 8,
    fontWeight: '900',
  },

  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 30,
    fontSize: 13,
  },

  errorBox: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});