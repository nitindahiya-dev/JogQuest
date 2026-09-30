import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

type Integration = {
  id: string;
  provider: string;
  external_account_id:
    string | null;
  status:
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'ERROR';
  connected_at: string;
  last_sync_at:
    string | null;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const providers = [
  'garmin',
  'suunto',
  'polar',
  'coros',
  'fitbit',
  'wahoo',
  'hammerhead',
];

const formatProvider = (
  provider: string,
) => {
  return (
    provider.charAt(0).toUpperCase() +
    provider.slice(1)
  );
};

const formatDate = (
  value: string | null,
) => {
  if (!value) {
    return 'Never';
  }

  return new Date(
    value,
  ).toLocaleString(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  );
};

const IntegrationsScreen =
  () => {
    const [
      integrations,
      setIntegrations,
    ] = useState<Integration[]>(
      [],
    );

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      actionProvider,
      setActionProvider,
    ] = useState<string | null>(
      null,
    );

    const loadIntegrations =
      useCallback(
        async () => {
          try {
            setLoading(true);

            const response =
              await fetch(
                `${API_BASE_URL}/api/users/${DEV_USER_ID}/integrations`,
              );

            if (
              !response.ok
            ) {
              throw new Error(
                `Server returned ${response.status}`,
              );
            }

            const data =
              (await response.json()) as Integration[];

            setIntegrations(
              data,
            );
          } catch (error) {
            console.error(
              'Failed to load integrations:',
              error,
            );

            Alert.alert(
              'Error',
              'Could not load device integrations.',
            );
          } finally {
            setLoading(false);
          }
        },
        [],
      );

    useFocusEffect(
      useCallback(() => {
        loadIntegrations();
      }, [
        loadIntegrations,
      ]),
    );

    const getIntegration =
      (
        provider: string,
      ) => {
        return integrations.find(
          integration =>
            integration.provider ===
            provider,
        );
      };

    const connectGarmin =
      async () => {
        try {
          setActionProvider(
            'garmin',
          );

          const response =
            await fetch(
              `${API_BASE_URL}/api/users/${DEV_USER_ID}/integrations/garmin`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                body:
                  JSON.stringify({
                    externalAccountId:
                      'garmin-demo-001',
                  }),
              },
            );

          const data =
            (await response.json()) as {
              error?: string;
            };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ??
                'Failed to connect Garmin',
            );
          }

          await loadIntegrations();

          Alert.alert(
            'Garmin Connected',
            'Your Garmin account is now connected.',
          );
        } catch (error) {
          Alert.alert(
            'Connection Failed',
            error instanceof Error
              ? error.message
              : 'Could not connect Garmin.',
          );
        } finally {
          setActionProvider(
            null,
          );
        }
      };

    const importGarmin =
      async () => {
        try {
          setActionProvider(
            'garmin-sync',
          );

          const response =
            await fetch(
              `${API_BASE_URL}/api/users/${DEV_USER_ID}/integrations/garmin/import-demo`,
              {
                method: 'POST',
              },
            );

          const data =
            (await response.json()) as {
              error?: string;
              imported?: boolean;
              duplicate?: boolean;
              distanceKm?: number;
            };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ??
                'Failed to sync Garmin',
            );
          }

          await loadIntegrations();

          if (
            data.duplicate
          ) {
            Alert.alert(
              'Already Synced',
              'This Garmin activity has already been imported.',
            );
          } else {
            Alert.alert(
              'Activity Imported',
              `${(
                data.distanceKm ??
                0
              ).toFixed(
                2,
              )} km Garmin activity imported.`,
            );
          }
        } catch (error) {
          Alert.alert(
            'Sync Failed',
            error instanceof Error
              ? error.message
              : 'Could not sync Garmin.',
          );
        } finally {
          setActionProvider(
            null,
          );
        }
      };

    const disconnectProvider =
      async (
        provider: string,
      ) => {
        try {
          setActionProvider(
            provider,
          );

          const response =
            await fetch(
              `${API_BASE_URL}/api/users/${DEV_USER_ID}/integrations/${provider}`,
              {
                method: 'DELETE',
              },
            );

          const data =
            (await response.json()) as {
              error?: string;
            };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ??
                'Failed to disconnect',
            );
          }

          await loadIntegrations();
        } catch (error) {
          Alert.alert(
            'Error',
            error instanceof Error
              ? error.message
              : 'Could not disconnect provider.',
          );
        } finally {
          setActionProvider(
            null,
          );
        }
      };

    if (loading) {
      return (
        <View
          style={
            styles.center
          }>
          <ActivityIndicator
            size="small"
            color="#fff"
          />

          <Text
            style={
              styles.loadingText
            }>
            Loading integrations...
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={
          styles.container
        }
        contentContainerStyle={
          styles.content
        }>

        <Text
          style={
            styles.heading
          }>
          Device Integrations
        </Text>

        <Text
          style={
            styles.subtitle
          }>
          Connect your fitness devices and import activities into JogQuest.
        </Text>

        {providers.map(
          provider => {
            const integration =
              getIntegration(
                provider,
              );

            const connected =
              integration?.status ===
              'CONNECTED';

            const isLoading =
              actionProvider ===
                provider ||
              (
                provider ===
                  'garmin' &&
                actionProvider ===
                  'garmin-sync'
              );

            return (
              <View
                key={
                  provider
                }
                style={
                  styles.card
                }>

                <View
                  style={
                    styles.cardTop
                  }>

                  <View
                    style={
                      styles.avatar
                    }>
                    <Text
                      style={
                        styles.avatarText
                      }>
                      {formatProvider(
                        provider,
                      ).charAt(0)}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.providerInfo
                    }>

                    <Text
                      style={
                        styles.providerName
                      }>
                      {formatProvider(
                        provider,
                      )}
                    </Text>

                    <Text
                      style={
                        styles.providerStatus
                      }>
                      {connected
                        ? 'CONNECTED'
                        : 'NOT CONNECTED'}
                    </Text>

                  </View>

                  {connected && (
                    <View
                      style={
                        styles.connectedBadge
                      }>
                      <Text
                        style={
                          styles.connectedBadgeText
                        }>
                        CONNECTED
                      </Text>
                    </View>
                  )}

                </View>

                <View
                  style={
                    styles.divider
                  }
                />

                <Text
                  style={
                    styles.syncText
                  }>
                  Last sync:{' '}
                  {formatDate(
                    integration?.last_sync_at ??
                      null,
                  )}
                </Text>

                {provider ===
                  'garmin' ? (
                  connected ? (
                    <View
                      style={
                        styles.actions
                      }>

                      <TouchableOpacity
                        style={
                          styles.primaryButton
                        }
                        onPress={
                          importGarmin
                        }
                        disabled={
                          isLoading
                        }>

                        {isLoading ? (
                          <ActivityIndicator
                            size="small"
                            color="#000"
                          />
                        ) : (
                          <Text
                            style={
                              styles.primaryButtonText
                            }>
                            SYNC GARMIN
                          </Text>
                        )}

                      </TouchableOpacity>

                      <TouchableOpacity
                        style={
                          styles.secondaryButton
                        }
                        onPress={() =>
                          disconnectProvider(
                            provider,
                          )
                        }
                        disabled={
                          isLoading
                        }>

                        <Text
                          style={
                            styles.secondaryButtonText
                          }>
                          DISCONNECT
                        </Text>

                      </TouchableOpacity>

                    </View>
                  ) : (
                    <TouchableOpacity
                      style={
                        styles.primaryButton
                      }
                      onPress={
                        connectGarmin
                      }
                      disabled={
                        isLoading
                      }>

                      {isLoading ? (
                        <ActivityIndicator
                          size="small"
                          color="#000"
                        />
                      ) : (
                        <Text
                          style={
                            styles.primaryButtonText
                          }>
                          CONNECT GARMIN
                        </Text>
                      )}

                    </TouchableOpacity>
                  )
                ) : (
                  <View
                    style={
                      styles.comingSoon
                    }>
                    <Text
                      style={
                        styles.comingSoonText
                      }>
                      PROVIDER INTEGRATION COMING SOON
                    </Text>
                  </View>
                )}

              </View>
            );
          },
        )}

      </ScrollView>
    );
  };

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000',
    },

    content: {
      padding: 18,
      paddingBottom: 40,
    },

    center: {
      flex: 1,
      backgroundColor:
        '#000',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    loadingText: {
      color: '#777',
      marginTop: 10,
      fontSize: 11,
    },

    heading: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
    },

    subtitle: {
      color: '#777',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
      marginBottom: 20,
    },

    card: {
      backgroundColor:
        '#111',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#292929',
      padding: 16,
      marginBottom: 12,
    },

    cardTop: {
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    avatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor:
        '#fff',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    avatarText: {
      color: '#000',
      fontSize: 18,
      fontWeight: '900',
    },

    providerInfo: {
      flex: 1,
      marginLeft: 12,
    },

    providerName: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '900',
    },

    providerStatus: {
      color: '#777',
      fontSize: 9,
      fontWeight: '800',
      marginTop: 4,
    },

    connectedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor:
        '#fff',
    },

    connectedBadgeText: {
      color: '#000',
      fontSize: 7,
      fontWeight: '900',
    },

    divider: {
      height: 1,
      backgroundColor:
        '#242424',
      marginVertical: 14,
    },

    syncText: {
      color: '#777',
      fontSize: 10,
      marginBottom: 12,
    },

    actions: {
      gap: 8,
    },

    primaryButton: {
      height: 44,
      borderRadius: 11,
      backgroundColor:
        '#fff',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    primaryButtonText: {
      color: '#000',
      fontSize: 10,
      fontWeight: '900',
    },

    secondaryButton: {
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#333',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    secondaryButtonText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '900',
    },

    comingSoon: {
      height: 38,
      borderRadius: 10,
      backgroundColor:
        '#0b0b0b',
      borderWidth: 1,
      borderColor: '#222',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    comingSoonText: {
      color: '#666',
      fontSize: 8,
      fontWeight: '900',
      textAlign: 'center',
    },
  });

export default IntegrationsScreen;
