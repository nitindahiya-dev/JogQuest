import React, {
  useCallback,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';

import MapView, {
  Polygon,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';

import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getTerritories,
  StoredTerritory,
} from '../../utils/territoryStorage';

import type {
  RootStackParamList,
} from '../../navigation/types';

type NavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

type ApiTerritory = {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  area_m2: number;
  area_km2: number;
  polygon: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  captured_at: string;
};

const API_BASE_URL = 'http://127.0.0.1:4000';

// ─── Design tokens ───
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.92)',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  border: 'rgba(255,255,255,0.12)',
};

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
};

const MapScreen = () => {
  const mapRef = useRef<MapView>(null);
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [territories, setTerritories] = useState<StoredTerritory[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const convertApiTerritory = (territory: ApiTerritory): StoredTerritory => {
    const ring = territory.polygon.coordinates[0] ?? [];
    const polygon = ring.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));

    return {
      id: territory.id,
      areaM2: Number(territory.area_m2),
      areaKm2: Number(territory.area_km2),
      polygon,
      activityType: territory.activity_type,
      capturedAt: territory.captured_at,
    };
  };

  const loadTerritories = useCallback(async () => {
    setLoading(true);
    setUsingFallback(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/territories`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = (await response.json()) as ApiTerritory[];
      const remoteTerritories = data.map(convertApiTerritory);
      setTerritories(remoteTerritories);

      if (remoteTerritories.length > 0 && remoteTerritories[0].polygon.length > 2) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(remoteTerritories[0].polygon, {
            edgePadding: {
              top: insets.top + 100,
              right: 60,
              bottom: insets.bottom + 180,
              left: 60,
            },
            animated: true,
          });
        }, 300);
      }
    } catch (error) {
      console.error('Failed to load territories from API:', error);

      const localTerritories = await getTerritories();
      setTerritories(localTerritories);
      setUsingFallback(true);

      if (localTerritories.length > 0) {
        const latest = localTerritories[localTerritories.length - 1];
        if (latest.polygon.length > 2) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(latest.polygon, {
              edgePadding: {
                top: insets.top + 100,
                right: 60,
                bottom: insets.bottom + 180,
                left: 60,
              },
              animated: true,
            });
          }, 300);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [insets.top, insets.bottom]);

  useFocusEffect(
    useCallback(() => {
      loadTerritories();
    }, [loadTerritories]),
  );

  const openTerritory = (territory: StoredTerritory) => {
    navigation.navigate('TerritoryDetails', {
      territoryId: territory.id,
    });
  };

  const totalArea = territories
    .reduce((acc, t) => acc + (t.areaKm2 || 0), 0)
    .toFixed(2);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        initialRegion={{
          latitude: 28.6139,
          longitude: 77.209,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}>
        {territories.map(territory => (
          <Polygon
            key={territory.id}
            coordinates={territory.polygon}
            strokeWidth={3}
            strokeColor={COLORS.accent}
            fillColor="rgba(212, 255, 0, 0.18)"
            tappable
            onPress={() => openTerritory(territory)}
          />
        ))}
      </MapView>

      {/* Floating Header — respects notch / Dynamic Island */}
      <View
        style={[
          styles.headerFloating,
          {top: insets.top + 12},
        ]}>
        <Text style={styles.headerTitle}>TERRITORY MAP</Text>
        <View style={styles.territoryBadge}>
          <Text style={styles.territoryBadgeText}>
            {territories.length} ZONE{territories.length === 1 ? '' : 'S'}
          </Text>
        </View>
      </View>

      {/* Offline badge */}
      {usingFallback && (
        <View
          style={[
            styles.fallbackBadge,
            {top: insets.top + 70},
          ]}>
          <Text style={styles.fallbackText}>OFFLINE DATA</Text>
        </View>
      )}

      {/* Bottom floating stats + CTA — above tab bar + home indicator */}
      <View
        style={[
          styles.bottomFloating,
          {bottom: insets.bottom + 90},
        ]}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TOTAL AREA</Text>
          <Text style={styles.statValue}>
            {totalArea}{' '}
            <Text style={styles.statUnit}>km²</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Activity')}>
          <Text style={styles.startButtonText}>START RUN</Text>
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {territories.length === 0 && !loading && (
        <View
          style={[
            styles.emptyCard,
            {bottom: insets.bottom + 170},
          ]}>
          <Text style={styles.emptyTitle}>No Territory Yet</Text>
          <Text style={styles.emptyText}>
            Complete a closed route to capture your first territory.
          </Text>
        </View>
      )}

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      )}
    </View>
  );
};

export default MapScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    flex: 1,
  },

  // Header
  headerFloating: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  territoryBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  territoryBadgeText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
  },

  // Offline
  fallbackBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(17,17,17,0.95)',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  fallbackText: {
    color: '#888',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Bottom bar
  bottomFloating: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statValue: {
    color: COLORS.accent,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  statUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 20,
  },
  startButtonText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  // Empty
  emptyCard: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 20,
    fontSize: 13,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});