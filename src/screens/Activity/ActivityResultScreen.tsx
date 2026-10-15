
import React from 'react';

import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';

import MapView, {
  PROVIDER_GOOGLE,
  Polygon,
  Polyline,
} from 'react-native-maps';

import {
  RouteProp,
  useRoute,
  useNavigation,
} from '@react-navigation/native';

import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {RootStackParamList} from '../../navigation/types';

type ActivityResultRouteProp = RouteProp<
  RootStackParamList,
  'ActivityResult'
>;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Design tokens
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.96)',
  surfaceLight: '#171717',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
};

const ActivityResultScreen = () => {
  const route = useRoute<ActivityResultRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const {
    activityType,
    distance,
    elapsedSeconds,
    pace,
    route: gpsRoute,
    territory,
  } = route.params;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`;

  const center =
    gpsRoute.length > 0
      ? gpsRoute[Math.floor(gpsRoute.length / 2)]
      : {
          latitude: 28.6139,
          longitude: 77.209,
        };

  return (
    <View style={styles.container}>
      {/* Fullscreen background map */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        userInterfaceStyle="dark"
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}>
        {gpsRoute.length > 1 && (
          <Polyline
            coordinates={gpsRoute}
            strokeWidth={4}
            strokeColor={COLORS.accent}
          />
        )}

        {territory.captured && territory.polygon.length > 2 && (
          <Polygon
            coordinates={territory.polygon}
            strokeWidth={3}
            strokeColor={COLORS.accent}
            fillColor="rgba(212, 255, 0, 0.22)"
          />
        )}
      </MapView>

      {/* Map overlay */}
      <View style={styles.overlay} pointerEvents="none" />

      {/* Top HUD: respects the status bar */}
      <View style={[styles.topHud, {top: insets.top + 16}]}>
        <View style={styles.topHudDot} />
        <Text style={styles.topHudText}>ACTIVITY SUMMARY</Text>
      </View>

      {/* Result sheet: respects the bottom safe area */}
      <View
        style={[
          styles.sheet,
          {paddingBottom: insets.bottom + 16},
        ]}>
        <View style={styles.handle} />

        <Text style={styles.title}>QUEST COMPLETE</Text>

        <Text style={styles.subtitle}>
          {activityType.toUpperCase()} COMPLETED
        </Text>

        {/* Activity statistics */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{distance.toFixed(2)}</Text>
            <Text style={styles.statLabel}>KM</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formattedTime}</Text>
            <Text style={styles.statLabel}>TIME</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{pace}</Text>
            <Text style={styles.statLabel}>PACE</Text>
          </View>
        </View>

        {/* Territory result */}
        {territory.captured ? (
          <View style={styles.territoryCard}>
            <Text style={styles.territoryEmoji}>🏆</Text>

            <View style={styles.territoryInfo}>
              <Text style={styles.territoryTitle}>
                TERRITORY CAPTURED
              </Text>

              <Text style={styles.territoryArea}>
                {territory.areaKm2.toFixed(3)} km²
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.territoryCard,
              styles.noTerritoryCard,
            ]}>
            <Text style={styles.territoryEmoji}>🗺️</Text>

            <View style={styles.territoryInfo}>
              <Text
                style={[
                  styles.territoryTitle,
                  styles.noTerritoryTitle,
                ]}>
                NO TERRITORY
              </Text>

              <Text style={styles.territorySubtitle}>
                Complete a closed loop to capture land.
              </Text>
            </View>
          </View>
        )}

        {/* Navigation actions */}
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Map')}>
          <Text style={styles.primaryButtonText}>BACK TO MAP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ActivityHistory')}>
          <Text style={styles.secondaryButtonText}>VIEW HISTORY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ActivityResultScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Top HUD
  topHud: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  topHudDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 9,
  },

  topHudText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Result sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 18,
  },

  title: {
    color: COLORS.accent,
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 22,
    letterSpacing: 0.8,
  },

  // Statistics
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 20,
    paddingVertical: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statBox: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },

  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  // Territory result
  territoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.10)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  noTerritoryCard: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
  },

  territoryEmoji: {
    fontSize: 30,
    marginRight: 14,
  },

  territoryInfo: {
    flex: 1,
  },

  territoryTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  noTerritoryTitle: {
    color: COLORS.textSecondary,
  },

  territoryArea: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },

  territorySubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  // Buttons
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 10,
  },

  primaryButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  secondaryButton: {
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
