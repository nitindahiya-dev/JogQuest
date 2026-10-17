import { API_BASE_URL } from '../../config/api';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';
import {
  UsersIcon, TrophyIcon, WatchIcon, SettingsIcon, BellIcon
} from '../../components/Icons';



const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, token, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/profile`);
      if (!response.ok) throw new Error('Failed to load');
      const data: any = await response.json();
      setProfile(data);
    } catch (err) {
      setError('Could not load profile data.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data: any = await response.json();
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch (err) {
      console.error('Failed to load notification count:', err);
    }
  }, [user?.id, token]);

  useFocusEffect(useCallback(() => { 
    loadProfile(); 
    loadUnreadCount();
  }, [loadProfile, loadUnreadCount]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  if (error || !profile) return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>PROFILE</Text>
        <TouchableOpacity style={styles.notificationButton} onPress={() => navigation.getParent()?.navigate('Notifications')}>
          <View style={styles.notificationCircle}>
            <BellIcon color={COLORS.text} size={20} />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Hero Identity */}
      <View style={styles.heroSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarGlow} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.display_name?.charAt(0).toUpperCase() || 'N'}</Text>
          </View>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeLabel}>RANK</Text>
            <Text style={styles.rankBadgeValue}>#{profile.rank || 3}</Text>
          </View>
        </View>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        <View style={styles.levelBadge}>
          <View style={styles.levelDot} />
          <Text style={styles.levelText}>LEVEL {profile.level || 1}</Text>
        </View>
      </View>

      {/* ─── Redesigned Territory Stat ─── */}
      <View style={styles.territoryCard}>
        <View style={styles.territoryLeft}>
          <Text style={styles.territoryLabel}>TOTAL TERRITORY</Text>
          <View style={styles.territoryValueRow}>
            <Text style={styles.territoryValue}>
              {Number(profile.territory_km2 || 0.001).toFixed(3)}
            </Text>
            <Text style={styles.territoryUnit}>km²</Text>
          </View>
        </View>
        <View style={styles.territoryRight}>
          <TrophyIcon color={COLORS.accent} size={28} />
        </View>
      </View>

      {/* Quest Stats Grid */}
      <Text style={styles.sectionLabel}>QUEST STATS</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.activities_count || 5}</Text>
          <Text style={styles.statLabel}>ACTIVITIES</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{Number(profile.total_distance_km || 2.35).toFixed(1)}</Text>
          <Text style={styles.statLabel}>TOTAL KM</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.territories_captured || 1}</Text>
          <Text style={styles.statLabel}>CAPTURED</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.territories_defended || 0}</Text>
          <Text style={styles.statLabel}>DEFENDED</Text>
        </View>
      </View>

      {/* Primary CTA */}
      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.getParent()?.navigate('ActivityHistory')}>
        <Text style={styles.primaryButtonText}>VIEW ACTIVITY HISTORY</Text>
      </TouchableOpacity>

      {/* Secondary Actions Grid */}
      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.getParent()?.navigate('Clubs')}>
          <UsersIcon color={COLORS.text} size={22} />
          <Text style={styles.actionText}>CLUBS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.getParent()?.navigate('Competitions')}>
          <TrophyIcon color={COLORS.text} size={22} />
          <Text style={styles.actionText}>COMPETITIONS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Integrations')}>
          <WatchIcon color={COLORS.text} size={22} />
          <Text style={styles.actionText}>DEVICES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ProfileDetails')}>
          <SettingsIcon color={COLORS.text} size={22} />
          <Text style={styles.actionText}>SETTINGS</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>SIGN OUT</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  contentContainer: { paddingHorizontal: SPACING.md },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  screenTitle: { ...TYPOGRAPHY.hero, fontSize: 28, letterSpacing: -0.5 },
  notificationButton: { padding: 2 },
  notificationCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationBadge: { position: 'absolute', right: -2, top: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.accent, borderWidth: 2, borderColor: COLORS.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notificationBadgeText: { color: COLORS.background, fontSize: 9, fontWeight: '900' },

  heroSection: { alignItems: 'center', marginTop: 10, marginBottom: 24 },
  avatarContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatarGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.accent, opacity: 0.1, transform: [{ scale: 1.15 }] },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: COLORS.background, zIndex: 2 },
  avatarText: { color: COLORS.background, fontSize: 40, fontWeight: '900' },
  rankBadge: { position: 'absolute', bottom: -8, right: -12, backgroundColor: COLORS.surfaceLight, borderWidth: 2, borderColor: COLORS.accent, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', zIndex: 3, flexDirection: 'row', gap: 4 },
  rankBadgeLabel: { color: COLORS.textMuted, fontSize: 8, fontWeight: '900' },
  rankBadgeValue: { color: COLORS.accent, fontSize: 14, fontWeight: '900' },
  name: { ...TYPOGRAPHY.h1, fontSize: 28, marginTop: 20 },
  username: { ...TYPOGRAPHY.body, fontSize: 15, marginTop: 2, color: COLORS.textMuted },
  levelBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.surfaceLight, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  levelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent, marginRight: 6 },
  levelText: { ...TYPOGRAPHY.label, color: COLORS.text, fontSize: 10 },

  // ─── Redesigned Territory Card ───
  territoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    ...SHADOWS.glow,
  },
  territoryLeft: { flex: 1 },
  territoryRight: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  territoryLabel: { ...TYPOGRAPHY.label, color: COLORS.textMuted, fontSize: 10, marginBottom: 4 },
  territoryValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  territoryValue: { ...TYPOGRAPHY.hero, fontSize: 38, color: COLORS.accent, letterSpacing: -1 },
  territoryUnit: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600', marginBottom: 6 },

  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textMuted, marginBottom: 12, marginTop: 8 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statBox: { width: '48%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  statValue: { ...TYPOGRAPHY.h1, fontSize: 24 },
  statLabel: { ...TYPOGRAPHY.label, fontSize: 9, marginTop: 6, color: COLORS.textMuted },

  primaryButton: { backgroundColor: COLORS.accent, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...SHADOWS.glow },
  primaryButtonText: { ...TYPOGRAPHY.label, color: COLORS.background, fontSize: 13 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionButton: { width: '48%', backgroundColor: COLORS.surface, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 10 },
  actionText: { ...TYPOGRAPHY.label, color: COLORS.text, fontSize: 11 },

  logoutButton: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 77, 77, 0.3)', backgroundColor: 'rgba(255, 77, 77, 0.05)', marginBottom: 20 },
  logoutButtonText: { ...TYPOGRAPHY.label, color: COLORS.danger, fontSize: 13 },
});

export default ProfileScreen;