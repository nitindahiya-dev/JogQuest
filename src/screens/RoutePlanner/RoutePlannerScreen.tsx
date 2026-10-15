
import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import MapView, {
  MapPressEvent,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import {useNavigation} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {
  Coordinate,
  RootStackParamList,
} from '../../navigation/types';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'RoutePlanner'
>;

type ActivityType = 'Run' | 'Walk' | 'Cycle';

type PlannedRoute = {
  activityType: ActivityType;
  route: Coordinate[];
  points: Coordinate[];
  distanceKm: number;
  durationSeconds: number;
  savedAt: string;
};

type RouteApiResponse = {
  activityType: ActivityType;
  distanceKm: number;
  durationSeconds: number;
  points: Coordinate[];
  route: Coordinate[];
  error?: string;
};

const API_BASE_URL = 'http://127.0.0.1:4000';
const PLANNED_ROUTE_KEY = '@jogquest/planned_route';

// Design tokens
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

const RoutePlannerScreen = () => {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const routingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [activityType, setActivityType] = useState<ActivityType>('Run');
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [routedRoute, setRoutedRoute] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [routing, setRouting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup pending debounce timer
  useEffect(() => {
    return () => {
      if (routingTimerRef.current) {
        clearTimeout(routingTimerRef.current);
      }
    };
  }, []);

  // Request a road route from the backend
  const requestRoute = async (
    nextPoints: Coordinate[],
    nextActivityType: ActivityType,
  ) => {
    if (nextPoints.length < 2) {
      setRoutedRoute([]);
      setDistanceKm(0);
      setDurationSeconds(0);
      setRouting(false);
      return;
    }

    try {
      setRouting(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activityType: nextActivityType,
          points: nextPoints,
        }),
      });

      const data = (await response.json()) as RouteApiResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate route');
      }

      if (!Array.isArray(data.route) || data.route.length < 2) {
        throw new Error('Routing service returned an invalid route');
      }

      setRoutedRoute(data.route);
      setDistanceKm(Number(data.distanceKm));
      setDurationSeconds(Number(data.durationSeconds));

      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          data.route.map(point => ({
            latitude: point.latitude,
            longitude: point.longitude,
          })),
          {
            edgePadding: {
              top: insets.top + 180,
              right: 40,
              bottom: insets.bottom + 300,
              left: 40,
            },
            animated: true,
          },
        );
      }, 100);
    } catch (err) {
      console.error('Route generation failed:', err);

      setRoutedRoute([]);
      setDistanceKm(0);
      setDurationSeconds(0);

      setError(
        err instanceof Error
          ? err.message
          : 'Could not generate route',
      );
    } finally {
      setRouting(false);
    }
  };

  // Debounce route requests while the user adds or changes points
  const scheduleRouteRequest = (
    nextPoints: Coordinate[],
    nextActivityType: ActivityType,
  ) => {
    if (routingTimerRef.current) {
      clearTimeout(routingTimerRef.current);
    }

    routingTimerRef.current = setTimeout(() => {
      requestRoute(nextPoints, nextActivityType);
    }, 700);
  };

  // Add a waypoint by tapping the map
  const handleMapPress = (event: MapPressEvent) => {
    if (routing) {
      return;
    }

    const {latitude, longitude} = event.nativeEvent.coordinate;

    const newPoint: Coordinate = {
      latitude,
      longitude,
    };

    setError(null);

    setPoints(currentPoints => {
      const nextPoints = [...currentPoints, newPoint];

      scheduleRouteRequest(nextPoints, activityType);

      return nextPoints;
    });
  };

  // Change activity type
  const changeActivityType = (nextType: ActivityType) => {
    if (routing || nextType === activityType) {
      return;
    }

    setActivityType(nextType);

    if (points.length >= 2) {
      scheduleRouteRequest(points, nextType);
    }
  };

  // Remove the last waypoint
  const undoLastPoint = () => {
    if (routing) {
      return;
    }

    setPoints(currentPoints => {
      const nextPoints = currentPoints.slice(0, -1);

      if (nextPoints.length >= 2) {
        scheduleRouteRequest(nextPoints, activityType);
      } else {
        setRoutedRoute([]);
        setDistanceKm(0);
        setDurationSeconds(0);
      }

      return nextPoints;
    });
  };

  // Close the route by connecting the last point to the first
  const closeRoute = () => {
    if (routing || points.length < 2) {
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];

    const alreadyClosed =
      first.latitude === last.latitude &&
      first.longitude === last.longitude;

    if (alreadyClosed) {
      return;
    }

    const nextPoints = [
      ...points,
      {
        latitude: first.latitude,
        longitude: first.longitude,
      },
    ];

    setPoints(nextPoints);
    scheduleRouteRequest(nextPoints, activityType);
  };

  // Clear the planned route
  const clearRoute = () => {
    if (routing) {
      return;
    }

    if (routingTimerRef.current) {
      clearTimeout(routingTimerRef.current);
      routingTimerRef.current = null;
    }

    setPoints([]);
    setRoutedRoute([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setError(null);
  };

  // Save the planned route locally
  const saveRoute = async () => {
    if (points.length < 2) {
      Alert.alert(
        'Route too short',
        'Add at least two points to create a route.',
      );
      return;
    }

    if (routedRoute.length < 2) {
      Alert.alert(
        'Route not ready',
        'Wait for the road route to finish generating.',
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const plannedRoute: PlannedRoute = {
        activityType,
        route: routedRoute,
        points,
        distanceKm,
        durationSeconds,
        savedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        PLANNED_ROUTE_KEY,
        JSON.stringify(plannedRoute),
      );

      Alert.alert(
        'Route saved',
        `${distanceKm.toFixed(2)} km road route saved.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (err) {
      console.error('Failed to save planned route:', err);

      Alert.alert(
        'Save failed',
        'Could not save the planned route.',
      );
    } finally {
      setSaving(false);
    }
  };

  // Format estimated duration
  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;

      return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`;
    }

    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  };

  const displayRoute =
    routedRoute.length > 1 ? routedRoute : points;

  return (
    <View style={styles.container}>
      {/* Fullscreen map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        onPress={handleMapPress}
        userInterfaceStyle="dark"
        initialRegion={{
          latitude: 28.6139,
          longitude: 77.209,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}>
        {points.map((point, index) => (
          <Marker
            key={`point-${index}-${point.latitude}-${point.longitude}`}
            coordinate={{
              latitude: point.latitude,
              longitude: point.longitude,
            }}
            title={`Waypoint ${index + 1}`}
            pinColor={COLORS.accent}
          />
        ))}

        {displayRoute.length > 1 && (
          <Polyline
            coordinates={displayRoute}
            strokeWidth={5}
            strokeColor={COLORS.accent}
          />
        )}
      </MapView>

      {/* Top HUD: positioned below the status bar */}
      <View
        style={[
          styles.topHud,
          {top: insets.top + 16},
        ]}>
        <View style={styles.topHudContent}>
          <View style={styles.headingContainer}>
            <Text style={styles.hudTitle}>ROUTE PLANNER</Text>

            <Text style={styles.hudSubtitle}>
              Tap map to add waypoints
            </Text>
          </View>

          {routing && (
            <ActivityIndicator color={COLORS.accent} />
          )}
        </View>

        <View style={styles.typeRow}>
          {(['Run', 'Walk', 'Cycle'] as ActivityType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeBtn,
                activityType === type && styles.typeBtnActive,
              ]}
              onPress={() => changeActivityType(type)}
              disabled={routing}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.typeText,
                  activityType === type && styles.typeTextActive,
                ]}>
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>

      {/* Bottom HUD: positioned above the device navigation area */}
      <View
        style={[
          styles.bottomHud,
          {bottom: insets.bottom + 16},
        ]}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {distanceKm.toFixed(2)}
            </Text>

            <Text style={styles.statLabel}>KM</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatDuration(durationSeconds)}
            </Text>

            <Text style={styles.statLabel}>EST. TIME</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>{points.length}</Text>
            <Text style={styles.statLabel}>POINTS</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              (routing || points.length === 0) &&
                styles.actionBtnDisabled,
            ]}
            onPress={undoLastPoint}
            disabled={routing || points.length === 0}
            activeOpacity={0.8}>
            <Text style={styles.iconBtnText}>UNDO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.iconBtn,
              (routing || points.length < 2) &&
                styles.actionBtnDisabled,
            ]}
            onPress={closeRoute}
            disabled={routing || points.length < 2}
            activeOpacity={0.8}>
            <Text style={styles.iconBtnText}>CLOSE LOOP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.iconBtn,
              (routing || points.length === 0) &&
                styles.actionBtnDisabled,
            ]}
            onPress={clearRoute}
            disabled={routing || points.length === 0}
            activeOpacity={0.8}>
            <Text style={styles.iconBtnText}>CLEAR</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            (points.length < 2 ||
              routedRoute.length < 2 ||
              routing ||
              saving) &&
              styles.saveBtnDisabled,
          ]}
          onPress={saveRoute}
          disabled={
            saving ||
            routing ||
            points.length < 2 ||
            routedRoute.length < 2
          }
          activeOpacity={0.85}>
          {saving ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Text style={styles.saveBtnText}>SAVE ROUTE</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default RoutePlannerScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top HUD
  topHud: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  topHudContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  headingContainer: {
    flex: 1,
  },

  hudTitle: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  hudSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },

  typeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },

  typeBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  typeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },

  typeTextActive: {
    color: COLORS.background,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },

  // Bottom HUD
  bottomHud: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  stat: {
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
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.3,
  },

  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },

  // Route actions
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: 12,
  },

  iconBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },

  iconBtnText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '900',
  },

  actionBtnDisabled: {
    opacity: 0.45,
  },

  saveBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },

  saveBtnDisabled: {
    backgroundColor: '#2A2A2A',
  },

  saveBtnText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
