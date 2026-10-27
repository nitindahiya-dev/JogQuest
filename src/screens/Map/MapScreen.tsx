import { API_BASE_URL } from '../../config/api';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import DeviceInfo from 'react-native-device-info';

import MapView, {
  Polygon,
  PROVIDER_GOOGLE,
  type UserLocationChangeEvent,
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
import {useAuth} from '../../auth/AuthContext';
import {useJogQuestAlert} from '../../components/JogQuestAlert';

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

const TERRITORY_OWNER_COLORS = [
  {stroke: '#42A5F5', fill: 'rgba(66, 165, 245, 0.22)'},
  {stroke: '#AB47BC', fill: 'rgba(171, 71, 188, 0.22)'},
  {stroke: '#FF7043', fill: 'rgba(255, 112, 67, 0.22)'},
  {stroke: '#26A69A', fill: 'rgba(38, 166, 154, 0.22)'},
  {stroke: '#EC407A', fill: 'rgba(236, 64, 122, 0.22)'},
  {stroke: '#FFCA28', fill: 'rgba(255, 202, 40, 0.22)'},
];

const getTerritoryColors = (
  ownerId: string | undefined,
  currentUserId: string | undefined,
) => {
  if (!ownerId) {
    return {stroke: '#777777', fill: 'rgba(150, 150, 150, 0.16)'};
  }

  if (currentUserId && ownerId === currentUserId) {
    return {stroke: '#D4FF00', fill: 'rgba(212, 255, 0, 0.18)'};
  }

  let hash = 0;
  for (let i = 0; i < ownerId.length; i += 1) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) | 0;
  }

  return TERRITORY_OWNER_COLORS[
    (hash >>> 0) % TERRITORY_OWNER_COLORS.length
  ];
};

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
  const alert = useJogQuestAlert();
    const {user} = useAuth();
const mapRef = useRef<MapView>(null);
  const hasCenteredOnUserRef = useRef(false);
  const userLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [territories, setTerritories] = useState<StoredTerritory[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selectedTerritoryIndex, setSelectedTerritoryIndex] = useState(0);
  const [showTerritories, setShowTerritories] = useState(false);

  useEffect(() => {
    const checkLocationAccess = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'JogQuest Location Permission',
              message:
                'JogQuest needs your location to show your position on the territory map.',
              buttonPositive: 'Allow',
              buttonNegative: 'Cancel',
            },
          );

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            alert(
              'Location Permission Required',
              'Allow location access in Android settings to see your current position.',
            );
            return;
          }
        }

        const locationEnabled = await DeviceInfo.isLocationEnabled();

        if (!locationEnabled) {
          alert(
            'GPS Is Disabled',
            'Turn on your device location services to use the territory map.',
          );
        }
      } catch (error) {
        console.error('Failed to check location access:', error);
      }
    };

    checkLocationAccess();
  }, []);

  const convertApiTerritory = (territory: ApiTerritory): StoredTerritory => {
    const ring = territory.polygon.coordinates[0] ?? [];
    const polygon = ring.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));

    return {
      id: territory.id,
      ownerId: territory.user_id,
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
    } catch (error) {
      console.error('Failed to load territories from API:', error);

      const localTerritories = await getTerritories();
      setTerritories(localTerritories);
      setUsingFallback(true);
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

  const handleUserLocationChange = (
    event: UserLocationChangeEvent,
  ) => {
    const coordinate = event.nativeEvent.coordinate;

    if (!coordinate) {
      return;
    }

    userLocationRef.current = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };

    // Always center on the first real GPS fix.
    if (!hasCenteredOnUserRef.current) {
      hasCenteredOnUserRef.current = true;

      mapRef.current?.animateToRegion(
        {
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        700,
      );
    }
  };

  const goToMyLocation = () => {
    const location = userLocationRef.current;

    if (!location) {
      alert(
        'Location Not Available',
        'Waiting for your GPS location. Make sure Location services are enabled and try again.',
      );
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700,
    );
  };

  const focusTerritory = (territory: StoredTerritory) => {
    if (territory.polygon.length < 3) {
      return;
    }

    mapRef.current?.fitToCoordinates(territory.polygon, {
      edgePadding: {
        top: insets.top + 100,
        right: 60,
        bottom: insets.bottom + 180,
        left: 60,
      },
      animated: true,
    });
  };

  const cycleTerritory = () => {
    const validTerritories = territories.filter(
      territory => territory.polygon.length >= 3,
    );

    if (validTerritories.length === 0) {
      const currentLocation = userLocationRef.current;

      if (currentLocation) {
        mapRef.current?.animateToRegion(
          {
            ...currentLocation,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          },
          700,
        );
      } else {
        alert(
          'No Territories Yet',
          'Your current location will appear when GPS provides a location fix.',
        );
      }

      return;
    }

    const nextIndex =
      (selectedTerritoryIndex + 1) % validTerritories.length;

    setSelectedTerritoryIndex(nextIndex);
    focusTerritory(validTerritories[nextIndex]);
  };

  const toggleTerritories = () => {
    if (showTerritories) {
      setShowTerritories(false);

      // Return to the user's actual location when hiding territories.
      const location = userLocationRef.current;

      if (location) {
        mapRef.current?.animateToRegion(
          {
            ...location,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          },
          700,
        );
      }

      return;
    }

    if (territories.length === 0) {
      alert(
        'No Territories Yet',
        'Complete a closed route to capture your first territory.',
      );
      return;
    }

    setShowTerritories(true);

    const validTerritories = territories.filter(
      territory => territory.polygon.length >= 3,
    );

    if (validTerritories.length === 0) {
      return;
    }

    setSelectedTerritoryIndex(0);
    focusTerritory(validTerritories[0]);
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
        onUserLocationChange={handleUserLocationChange}
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        initialRegion={{
          // Temporary starting view until the real GPS fix arrives.
          latitude: 20.5937,
          longitude: 78.9629,
          latitudeDelta: 20,
          longitudeDelta: 20,
        }}>
        {showTerritories &&
          territories.map(territory => {
            const territoryColors = getTerritoryColors(
              territory.ownerId,
              user?.id,
            );

            return (
              <Polygon
                key={territory.id}
                coordinates={territory.polygon}
                strokeWidth={3}
                strokeColor={territoryColors.stroke}
                fillColor={territoryColors.fill}
                tappable
                onPress={() => openTerritory(territory)}
              />
            );
          })}
      </MapView>

      {/* Floating Header — respects notch / Dynamic Island */}
      <TouchableOpacity
        style={[
          styles.headerFloating,
          {top: insets.top + 12},
        ]}
        activeOpacity={0.8}
        onPress={toggleTerritories}>
        <View>
          <Text style={styles.headerTitle}>TERRITORY MAP</Text>
          <Text style={styles.headerHint}>
            {showTerritories
              ? 'TAP TO RETURN TO MY LOCATION'
              : 'TAP TO VIEW TERRITORIES'}
          </Text>
        </View>

        <View style={styles.territoryBadge}>
          <Text style={styles.territoryBadgeText}>
            {territories.length} ZONE{territories.length === 1 ? '' : 'S'}  ›
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.myLocationButton,
          {top: insets.top + 94},
        ]}
        activeOpacity={0.8}
        onPress={goToMyLocation}>
        <Text style={styles.myLocationButtonText}>
          ◎  WHERE AM I?
        </Text>
      </TouchableOpacity>

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
          onPress={() => navigation.navigate('MainTabs', { screen: 'Activity' })}>
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
  headerHint: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 5,
  },
  myLocationButton: {
    position: 'absolute',
    right: SPACING.md,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    elevation: 5,
  },
  myLocationButtonText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});