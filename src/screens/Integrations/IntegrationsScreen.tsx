import React, { useCallback, useState } from 'react';

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useJogQuestAlert } from '../../components/JogQuestAlert';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';

const API_BASE_URL = 'http://127.0.0.1:4000';

const providers = [
  'garmin',
  'suunto',
  'polar',
  'coros',
  'fitbit',
  'wahoo',
  'hammerhead',
];

type Integration = {
  provider: string;
  status: string;
  last_sync_at: string | null;
};

const providerDescriptions: Record<string, string> = {
  garmin: 'Sync activities from your Garmin device.',
  suunto: 'Connect your Suunto sports watch.',
  polar: 'Bring your Polar training data together.',
  coros: 'Sync activities from your COROS watch.',
  fitbit: 'Connect your Fitbit activity data.',
  wahoo: 'Bring your Wahoo workouts into JogQuest.',
  hammerhead: 'Connect your Hammerhead cycling computer.',
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not synced yet';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not synced yet';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getProviderName = (provider: string) =>
  provider.charAt(0).toUpperCase() + provider.slice(1);

const IntegrationsScreen = () => {
  const alert = useJogQuestAlert();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionProvider, setActionProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    if (!userId) {
      setIntegrations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/integrations`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? 'Unable to load your connected devices.',
        );
      }

      setIntegrations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your connected devices.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, token]);

  useFocusEffect(
    useCallback(() => {
      loadIntegrations();
    }, [loadIntegrations]),
  );

  const connectGarmin = async () => {
    if (!userId || actionProvider) return;

    try {
      setActionProvider('garmin');
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/integrations/garmin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            externalAccountId: 'garmin-demo-001',
          }),
        },
      );

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to connect Garmin.');
      }

      await loadIntegrations();

      alert(
        'Garmin Connected',
        'Your Garmin integration has been connected.',
      );
    } catch (err) {
      alert(
        'Connection Failed',
        err instanceof Error ? err.message : 'Unable to connect Garmin.',
      );
    } finally {
      setActionProvider(null);
    }
  };

  const disconnect = async (provider: string) => {
    if (!userId || actionProvider) return;

    try {
      setActionProvider(provider);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${userId}/integrations/${provider}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to disconnect device.');
      }

      await loadIntegrations();

      alert(
        'Device Disconnected',
        `${getProviderName(provider)} has been disconnected.`,
      );
    } catch (err) {
      alert(
        'Disconnect Failed',
        err instanceof Error ? err.message : 'Unable to disconnect device.',
      );
    } finally {
      setActionProvider(null);
    }
  };

  const connectedCount = integrations.filter(
    item => item.status === 'CONNECTED',
  ).length;

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.loadingIcon}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>

        <Text style={styles.loadingTitle}>Finding your devices</Text>
        <Text style={styles.loadingSubtitle}>
          Checking your integrations...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 36 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            onRefresh={() => {
              setRefreshing(true);
              loadIntegrations();
            }}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>YOUR ECOSYSTEM</Text>
          </View>

          <Text style={styles.title}>
            CONNECT<Text style={styles.titleAccent}>.</Text>
          </Text>

          <Text style={styles.subtitle}>
            Bring your training data together. Connect your devices
            and keep your activity tracking in one place.
          </Text>
        </View>

        {/* Overview */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewTop}>
            <View style={styles.overviewIcon}>
              <Text style={styles.overviewIconText}>⌁</Text>
            </View>

            <View style={styles.overviewStatus}>
              <View
                style={[
                  styles.statusDot,
                  connectedCount > 0 && styles.statusDotActive,
                ]}
              />
              <Text style={styles.overviewStatusText}>
                {connectedCount > 0 ? 'CONNECTED' : 'NOT CONNECTED'}
              </Text>
            </View>
          </View>

          <Text style={styles.overviewTitle}>
            Your devices. One place.
          </Text>

          <Text style={styles.overviewDescription}>
            Connect supported fitness platforms to simplify activity
            tracking.
          </Text>

          <View style={styles.overviewDivider} />

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{connectedCount}</Text>
              <Text style={styles.statLabel}>CONNECTED</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>{providers.length}</Text>
              <Text style={styles.statLabel}>PLATFORMS</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statBlock}>
              <Text style={styles.statNumber}>
                {providers.length - connectedCount}
              </Text>
              <Text style={styles.statLabel}>NOT CONNECTED</Text>
            </View>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Couldn't load integrations
              </Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadIntegrations}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Devices */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>FITNESS PLATFORMS</Text>
            <Text style={styles.sectionSubtitle}>
              Choose a device to get started
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {connectedCount}/{providers.length}
            </Text>
          </View>
        </View>

        {providers.map((provider, index) => {
          const integration = integrations.find(
            item => item.provider === provider,
          );

          const connected = integration?.status === 'CONNECTED';
          const isLoading = actionProvider === provider;
          const isGarmin = provider === 'garmin';

          return (
            <View
              key={provider}
              style={[
                styles.deviceCard,
                connected && styles.deviceCardConnected,
              ]}
            >
              <View style={styles.deviceTop}>
                <View
                  style={[
                    styles.deviceIcon,
                    connected && styles.deviceIconConnected,
                  ]}
                >
                  <Text
                    style={[
                      styles.deviceIconText,
                      connected && styles.deviceIconTextConnected,
                    ]}
                  >
                    {getProviderName(provider).charAt(0)}
                  </Text>
                </View>

                <View style={styles.deviceInfo}>
                  <View style={styles.deviceNameRow}>
                    <Text style={styles.deviceName}>
                      {getProviderName(provider)}
                    </Text>

                    {connected && (
                      <View style={styles.connectedBadge}>
                        <View style={styles.connectedDot} />
                        <Text style={styles.connectedBadgeText}>
                          CONNECTED
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.deviceDescription}>
                    {providerDescriptions[provider]}
                  </Text>
                </View>
              </View>

              <View style={styles.deviceDivider} />

              <View style={styles.deviceFooter}>
                <View style={styles.deviceMeta}>
                  <Text style={styles.deviceMetaLabel}>
                    {connected ? 'LAST SYNC' : 'STATUS'}
                  </Text>

                  <Text style={styles.deviceMetaValue}>
                    {connected
                      ? formatDate(integration?.last_sync_at)
                      : isGarmin
                        ? 'Ready to connect'
                        : 'Integration coming soon'}
                  </Text>
                </View>

                {isGarmin ? (
                  connected ? (
                    <TouchableOpacity
                      style={styles.disconnectButton}
                      onPress={() => disconnect(provider)}
                      disabled={Boolean(actionProvider)}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={COLORS.text} size="small" />
                      ) : (
                        <Text style={styles.disconnectButtonText}>
                          DISCONNECT
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.connectButton}
                      onPress={connectGarmin}
                      disabled={Boolean(actionProvider)}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator
                          color={COLORS.background}
                          size="small"
                        />
                      ) : (
                        <>
                          <Text style={styles.connectButtonText}>
                            CONNECT
                          </Text>
                          <Text style={styles.connectButtonArrow}>↗</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>COMING SOON</Text>
                  </View>
                )}
              </View>

              {index < providers.length - 1 && null}
            </View>
          );
        })}

        {/* Footer note */}
        <View style={styles.footerNote}>
          <Text style={styles.footerIcon}>ⓘ</Text>

          <View style={styles.footerTextContainer}>
            <Text style={styles.footerTitle}>More integrations ahead</Text>
            <Text style={styles.footerDescription}>
              Additional device connections will become available as
              support is added.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default IntegrationsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: 22,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },

  loadingIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  loadingTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: SPACING.lg,
  },

  loadingSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: SPACING.sm,
  },

  // Header
  header: {
    paddingTop: 8,
    paddingBottom: SPACING.lg,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },

  eyebrow: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    fontSize: 9,
    letterSpacing: 1.5,
  },

  title: {
    ...TYPOGRAPHY.hero,
    color: COLORS.text,
    fontSize: 35,
    letterSpacing: -1,
  },

  titleAccent: {
    color: COLORS.accent,
  },

  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: SPACING.sm,
    maxWidth: 340,
  },

  // Overview
  overviewCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    padding: SPACING.md,
    marginBottom: 30,
  },

  overviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  overviewIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: 'rgba(212,255,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overviewIconText: {
    color: COLORS.accent,
    fontSize: 29,
    fontWeight: '800',
  },

  overviewStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
    marginRight: 7,
  },

  statusDotActive: {
    backgroundColor: COLORS.accent,
  },

  overviewStatusText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    fontSize: 8,
    letterSpacing: 0.5,
  },

  overviewTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '900',
    marginTop: SPACING.md,
  },

  overviewDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  overviewDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statBlock: {
    flex: 1,
    alignItems: 'center',
  },

  statNumber: {
    color: COLORS.accent,
    fontSize: 23,
    fontWeight: '900',
  },

  statLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.3,
    marginTop: 5,
    textAlign: 'center',
  },

  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 5,
  },

  countBadge: {
    minWidth: 46,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  countBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
  },

  // Device cards
  deviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  deviceCardConnected: {
    borderColor: 'rgba(212,255,0,0.28)',
  },

  deviceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deviceIconConnected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    ...SHADOWS.glow,
  },

  deviceIconText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
  },

  deviceIconTextConnected: {
    color: COLORS.background,
  },

  deviceInfo: {
    flex: 1,
    marginLeft: SPACING.md,
    paddingTop: 2,
  },

  deviceNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },

  deviceName: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    fontSize: 15,
  },

  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,255,0,0.10)',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  connectedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginRight: 5,
  },

  connectedBadgeText: {
    color: COLORS.accent,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  deviceDescription: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },

  deviceDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },

  deviceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },

  deviceMeta: {
    flex: 1,
  },

  deviceMetaLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.7,
  },

  deviceMetaValue: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },

  connectButton: {
    minWidth: 108,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 11,
    paddingHorizontal: 12,
    ...SHADOWS.glow,
  },

  connectButtonText: {
    color: COLORS.background,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  connectButtonArrow: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 7,
  },

  disconnectButton: {
    minWidth: 108,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 10,
  },

  disconnectButtonText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  comingSoonBadge: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
  },

  comingSoonText: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Error
  errorBox: {
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.25)',
    borderRadius: 15,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },

  errorContent: {
    marginBottom: SPACING.sm,
  },

  errorTitle: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '900',
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  retryButtonText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: '900',
  },

  // Footer
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },

  footerIcon: {
    color: COLORS.accent,
    fontSize: 17,
    marginRight: 10,
  },

  footerTextContainer: {
    flex: 1,
  },

  footerTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },

  footerDescription: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
});