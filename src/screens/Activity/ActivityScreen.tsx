import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {createTerritory} from '../../utils/territory';
import {saveTerritory} from '../../utils/territoryStorage';

import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';

import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../navigation/types';

import {
  calculateDistance,
  Coordinate,
  formatTime,
} from '../../utils/geo';
import {useAuth} from '../../auth/AuthContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ActivityType = 'Run' | 'Walk' | 'Cycle';

type PlannedRoute = {
  activityType: ActivityType;
  route: Coordinate[];
  distanceKm: number;
  savedAt: string;
};

type CreateActivityResponse = {
  ok: boolean;
  activity: {
    id: string;
    created_at: string;
  };
};

type ClaimTerritoryResponse = {
  ok: boolean;
  territory: {
    id: string;
    area_m2: number | string;
    area_km2: number | string;
    activity_type: ActivityType;
    captured_at: string;
    polygon: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  };
};

const API_BASE_URL = 'http://127.0.0.1:4000';
const PLANNED_ROUTE_KEY = '@jogquest/planned_route';

// ─── Design tokens ───
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.94)',
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

const ActivityScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user, token} = useAuth();
  const insets = useSafeAreaInsets();

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Authentication required.</Text>
      </View>
    );
  }

  const mapRef = useRef<MapView>(null);

  const [activityType, setActivityType] = useState<ActivityType>('Run');
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute | null>(null);
  const [distance, setDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const lastLocationRef = useRef<Coordinate | null>(null);
  const routeProgressMaxRef = useRef(0);

  // --------------------------------------------------
  // LOAD PLANNED ROUTE
  // --------------------------------------------------
  const loadPlannedRoute = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PLANNED_ROUTE_KEY);
      if (!stored) {
        setPlannedRoute(null);
        return;
      }

      const parsed = JSON.parse(stored) as Partial<PlannedRoute>;
      if (
        !parsed.activityType ||
        !Array.isArray(parsed.route) ||
        parsed.route.length < 2 ||
        typeof parsed.distanceKm !== 'number'
      ) {
        setPlannedRoute(null);
        return;
      }

      const nextRoute: PlannedRoute = {
        activityType: parsed.activityType,
        route: parsed.route,
        distanceKm: parsed.distanceKm,
        savedAt: parsed.savedAt ?? new Date().toISOString(),
      };

      setPlannedRoute(nextRoute);
      setActivityType(nextRoute.activityType);
    } catch (error) {
      console.error('Failed to load planned route:', error);
      setPlannedRoute(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlannedRoute();
    }, [loadPlannedRoute]),
  );

  // --------------------------------------------------
  // FIT MAP TO PLANNED ROUTE
  // --------------------------------------------------
  useEffect(() => {
    if (!plannedRoute || plannedRoute.route.length < 2) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        plannedRoute.route.map(point => ({
          latitude: point.latitude,
          longitude: point.longitude,
        })),
        {
          edgePadding: {
            top: insets.top + 100,
            right: 40,
            bottom: insets.bottom + 320,
            left: 40,
          },
          animated: true,
        },
      );
    }, 350);

    return () => clearTimeout(timer);
  }, [plannedRoute, insets.top, insets.bottom]);

  // --------------------------------------------------
  // LOCATION PERMISSION
  // --------------------------------------------------
  useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS !== 'android') return;
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    };
    requestLocationPermission();
  }, []);

  // --------------------------------------------------
  // TIMER
  // --------------------------------------------------
  useEffect(() => {
    if (!isTracking || isPaused) return;

    const timer = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTracking, isPaused]);

  // --------------------------------------------------
  // GPS LOCATION
  // --------------------------------------------------
  const handleLocationChange = (event: any) => {
    if (!isTracking || isPaused) return;

    const coordinate: Coordinate = event.nativeEvent.coordinate;
    if (!coordinate) return;

    if (typeof coordinate.accuracy === 'number' && coordinate.accuracy > 50) {
      return;
    }

    const lastLocation = lastLocationRef.current;

    if (!lastLocation) {
      lastLocationRef.current = coordinate;
      setRoute([coordinate]);
      return;
    }

    const segmentDistance = calculateDistance(lastLocation, coordinate);

    if (segmentDistance < 0.003) return;
    if (segmentDistance > 0.5) return;

    setDistance(current => current + segmentDistance);
    setRoute(current => [...current, coordinate]);
    lastLocationRef.current = coordinate;
  };

  // --------------------------------------------------
  // START / PAUSE / RESUME
  // --------------------------------------------------
  const startActivity = () => {
    setRoute([]);
    setDistance(0);
    routeProgressMaxRef.current = 0;
    setElapsedSeconds(0);
    setIsPaused(false);
    setIsSaving(false);
    lastLocationRef.current = null;
    startTimeRef.current = Date.now();
    startedAtRef.current = new Date().toISOString();
    setIsTracking(true);
  };

  const pauseActivity = () => {
    setIsPaused(true);
    lastLocationRef.current = null;
  };

  const resumeActivity = () => {
    setIsPaused(false);
    lastLocationRef.current = null;
  };

  const clearPlannedRoute = async () => {
    try {
      await AsyncStorage.removeItem(PLANNED_ROUTE_KEY);
      setPlannedRoute(null);
    } catch (error) {
      console.error('Failed to clear planned route:', error);
    }
  };

  // --------------------------------------------------
  // ROUTE PROGRESS
  // --------------------------------------------------
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  const getProjectedPointOnSegment = (
    point: Coordinate,
    start: Coordinate,
    end: Coordinate,
  ): Coordinate => {
    const latRadians = (start.latitude * Math.PI) / 180;
    const metersPerLatitudeDegree = 111_320;
    const metersPerLongitudeDegree = 111_320 * Math.cos(latRadians);

    const pointX = (point.longitude - start.longitude) * metersPerLongitudeDegree;
    const pointY = (point.latitude - start.latitude) * metersPerLatitudeDegree;
    const segmentX = (end.longitude - start.longitude) * metersPerLongitudeDegree;
    const segmentY = (end.latitude - start.latitude) * metersPerLatitudeDegree;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared === 0) return start;

    const projection = clamp01(
      (pointX * segmentX + pointY * segmentY) / segmentLengthSquared,
    );

    return {
      latitude: start.latitude + (end.latitude - start.latitude) * projection,
      longitude: start.longitude + (end.longitude - start.longitude) * projection,
    };
  };

  const getRouteProgress = () => {
    if (!plannedRoute || route.length === 0 || plannedRoute.route.length < 2) {
      return {
        progress: 0,
        distanceFromRoute: null as number | null,
        status: 'WAITING FOR GPS',
      };
    }

    const currentPoint = route[route.length - 1];
    let nearestDistance = Number.POSITIVE_INFINITY;
    let distanceAlongRoute = 0;
    let cumulativeDistance = 0;
    let nearestDistanceAlongRoute = 0;

    for (let index = 0; index < plannedRoute.route.length - 1; index += 1) {
      const segmentStart = plannedRoute.route[index];
      const segmentEnd = plannedRoute.route[index + 1];
      const segmentLength = calculateDistance(segmentStart, segmentEnd);
      const projectedPoint = getProjectedPointOnSegment(
        currentPoint,
        segmentStart,
        segmentEnd,
      );
      const distanceToSegment = calculateDistance(currentPoint, projectedPoint);

      if (distanceToSegment < nearestDistance) {
        nearestDistance = distanceToSegment;
        distanceAlongRoute =
          cumulativeDistance + calculateDistance(segmentStart, projectedPoint);
        nearestDistanceAlongRoute = distanceAlongRoute;
      }

      cumulativeDistance += segmentLength;
    }

    const totalRouteDistance = cumulativeDistance;
    const endpoint = plannedRoute.route[plannedRoute.route.length - 1];
    const distanceToEndpoint = calculateDistance(currentPoint, endpoint);
    const completed = distanceToEndpoint <= 0.05;
    const isNearRoute = nearestDistance <= 0.15;

    const candidateProgress =
      totalRouteDistance > 0
        ? Math.min(100, (nearestDistanceAlongRoute / totalRouteDistance) * 100)
        : 0;

    if (completed) {
      routeProgressMaxRef.current = 100;
    } else if (isNearRoute) {
      routeProgressMaxRef.current = Math.max(
        routeProgressMaxRef.current,
        candidateProgress,
      );
    }

    const progress = routeProgressMaxRef.current;
    const status =
      nearestDistance <= 0.05
        ? 'ON ROUTE'
        : nearestDistance <= 0.15
          ? 'NEAR ROUTE'
          : 'OFF ROUTE';

    return {
      progress,
      distanceFromRoute: nearestDistance,
      status,
    };
  };

  const routeProgressInfo = getRouteProgress();
  const routeProgress = routeProgressInfo.progress;
  const nearestPlannedDistance = routeProgressInfo.distanceFromRoute;
  const routeStatus = routeProgressInfo.status;
  const plannedDistance = plannedRoute?.distanceKm ?? 0;

  // --------------------------------------------------
  // PACE
  // --------------------------------------------------
  const calculatePace = (
    distanceKm = distance,
    seconds = elapsedSeconds,
  ) => {
    if (distanceKm <= 0.01) return '--';
    const secondsPerKm = seconds / distanceKm;
    const minutes = Math.floor(secondsPerKm / 60);
    const remainingSeconds = Math.floor(secondsPerKm % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  // --------------------------------------------------
  // SAVE ACTIVITY
  // --------------------------------------------------
  const saveActivityToBackend = async (
    finalTime: number,
    pace: string,
    territory: ReturnType<typeof createTerritory>,
  ): Promise<CreateActivityResponse> => {
    const finishedAt = new Date().toISOString();

    const response = await fetch(`${API_BASE_URL}/api/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        activityType,
        distanceKm: distance,
        elapsedSeconds: finalTime,
        pace,
        startedAt: startedAtRef.current ?? undefined,
        finishedAt,
        route,
        territory: territory.captured
          ? {
              areaM2: territory.areaM2,
              areaKm2: territory.areaKm2,
              polygon: territory.polygon,
            }
          : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }

    return (await response.json()) as CreateActivityResponse;
  };

  // --------------------------------------------------
  // CLAIM TERRITORY
  // --------------------------------------------------
  const claimTerritoryOnBackend = async (
    activityId: string,
    territory: ReturnType<typeof createTerritory>,
  ) => {
    if (!territory.captured) return null;

    const response = await fetch(`${API_BASE_URL}/api/territories/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        activityId,
        activityType,
        polygon: territory.polygon,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Territory claim failed (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as ClaimTerritoryResponse;
  };

  // --------------------------------------------------
  // FINISH
  // --------------------------------------------------
  const stopActivity = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const finalTime = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0;

    const finalPace = calculatePace(distance, finalTime);
    const territory = createTerritory(route);
    let resultTerritory = territory;

    try {
      const activityResponse = await saveActivityToBackend(
        finalTime,
        finalPace,
        territory,
      );

      if (territory.captured && activityResponse?.activity?.id) {
        try {
          const claimResponse = await claimTerritoryOnBackend(
            activityResponse.activity.id,
            territory,
          );

          if (!claimResponse?.territory?.polygon?.coordinates?.[0]) {
            throw new Error(
              'Territory claim succeeded but the server returned no polygon.',
            );
          }

          const savedTerritory = claimResponse.territory;
          const serverRing = savedTerritory.polygon.coordinates[0];

          await saveTerritory({
            id: savedTerritory.id,
            areaM2: Number(savedTerritory.area_m2),
            areaKm2: Number(savedTerritory.area_km2),
            polygon: serverRing.map(([longitude, latitude]) => ({
              latitude,
              longitude,
            })),
            activityType: savedTerritory.activity_type,
            capturedAt: savedTerritory.captured_at,
          });
        } catch (territoryError) {
          console.warn('Territory claim failed:', territoryError);
          resultTerritory = {...territory, captured: false};
          Alert.alert(
            'Territory Claim Failed',
            territoryError instanceof Error
              ? territoryError.message
              : String(territoryError),
          );
        }
      }

      setElapsedSeconds(finalTime);
      setIsTracking(false);
      setIsPaused(false);
      setIsSaving(false);
      startTimeRef.current = null;
      startedAtRef.current = null;
      lastLocationRef.current = null;

      navigation.navigate('ActivityResult', {
        activityType,
        distance,
        elapsedSeconds: finalTime,
        pace: finalPace,
        route,
        territory: resultTerritory,
      });
    } catch (error) {
      console.error('Failed to save activity:', error);
      setIsSaving(false);
      Alert.alert(
        'Activity Save Failed',
        'The activity could not be saved to the server. Please try again.',
      );
    }
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        userLocationPriority="high"
        userLocationUpdateInterval={3000}
        userLocationFastestInterval={2000}
        onUserLocationChange={handleLocationChange}
        initialRegion={{
          latitude: 28.6139,
          longitude: 77.209,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}>
        {plannedRoute && plannedRoute.route.length > 1 && (
          <Polyline
            coordinates={plannedRoute.route}
            strokeWidth={4}
            strokeColor="rgba(212, 255, 0, 0.45)"
            lineDashPattern={[10, 7]}
          />
        )}

        {plannedRoute && plannedRoute.route.length > 0 && (
          <Marker
            coordinate={{
              latitude: plannedRoute.route[0].latitude,
              longitude: plannedRoute.route[0].longitude,
            }}
            title="Route Start"
            pinColor={COLORS.accent}
          />
        )}

        {plannedRoute && plannedRoute.route.length > 1 && (
          <Marker
            coordinate={{
              latitude:
                plannedRoute.route[plannedRoute.route.length - 1].latitude,
              longitude:
                plannedRoute.route[plannedRoute.route.length - 1].longitude,
            }}
            title="Route End"
            pinColor="#FF4D4D"
          />
        )}

        {route.length > 1 && (
          <Polyline
            coordinates={route}
            strokeWidth={5}
            strokeColor={COLORS.accent}
          />
        )}
      </MapView>

      {/* ─── HUD OVERLAY ─── */}
      <View style={styles.hud} pointerEvents="box-none">
        {/* Top status badge — clears notch / Dynamic Island */}
        <View
          style={[
            styles.statusBadge,
            {marginTop: insets.top + 8},
          ]}>
          <View
            style={[
              styles.statusDot,
              isTracking && !isPaused && styles.statusDotActive,
            ]}
          />
          <Text style={styles.statusText}>
            {isSaving
              ? 'SAVING...'
              : isTracking
                ? isPaused
                  ? 'PAUSED'
                  : `${activityType.toUpperCase()} IN PROGRESS`
                : plannedRoute
                  ? 'ROUTE READY'
                  : 'READY TO START'}
          </Text>
        </View>

        {/* Bottom panel — above tab bar + home indicator */}
        <View
          style={[
            styles.bottomPanel,
            {marginBottom: insets.bottom + 90},
          ]}>
          {!isTracking && plannedRoute && (
            <View style={styles.plannedCard}>
              <View style={{flex: 1}}>
                <Text style={styles.plannedLabel}>PLANNED ROUTE</Text>
                <Text style={styles.plannedValue}>
                  {plannedRoute.distanceKm.toFixed(2)} km
                </Text>
                <Text style={styles.plannedMeta}>
                  {plannedRoute.activityType.toUpperCase()} ·{' '}
                  {plannedRoute.route.length} POINTS
                </Text>
              </View>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearPlannedRoute}>
                <Text style={styles.clearText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{distance.toFixed(2)}</Text>
              <Text style={styles.statLabel}>KM</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
              <Text style={styles.statLabel}>TIME</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{calculatePace()}</Text>
              <Text style={styles.statLabel}>PACE</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{route.length}</Text>
              <Text style={styles.statLabel}>GPS</Text>
            </View>
          </View>

          {isTracking && plannedRoute && (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={styles.progressTitle}>ROUTE PROGRESS</Text>
                  <Text style={styles.progressSub}>
                    {distance.toFixed(2)} / {plannedDistance.toFixed(2)} km
                  </Text>
                </View>
                <Text style={styles.progressPercent}>
                  {Math.round(routeProgress)}%
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, {width: `${routeProgress}%`}]}
                />
              </View>
              <View style={styles.progressFooter}>
                <Text style={styles.routeStatus}>{routeStatus}</Text>
                {nearestPlannedDistance !== null && (
                  <Text style={styles.routeDist}>
                    {Math.round(nearestPlannedDistance * 1000)} m from route
                  </Text>
                )}
              </View>
            </View>
          )}

          {!isTracking && (
            <View style={styles.typeRow}>
              {(['Run', 'Walk', 'Cycle'] as ActivityType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    activityType === type && styles.typeButtonActive,
                  ]}
                  onPress={() => setActivityType(type)}>
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
          )}

          <View style={styles.controls}>
            {!isTracking ? (
              <>
                <TouchableOpacity
                  style={styles.planButton}
                  onPress={() => navigation.navigate('RoutePlanner')}>
                  <Text style={styles.planText}>
                    {plannedRoute ? 'EDIT ROUTE' : 'PLAN ROUTE'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.startButton}
                  onPress={startActivity}>
                  <Text style={styles.startText}>
                    START {activityType.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.activeRow}>
                {!isPaused ? (
                  <TouchableOpacity
                    style={styles.pauseButton}
                    onPress={pauseActivity}>
                    <Text style={styles.pauseText}>PAUSE</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.resumeButton}
                    onPress={resumeActivity}>
                    <Text style={styles.resumeText}>RESUME</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.finishButton}
                  onPress={stopActivity}
                  disabled={isSaving}>
                  <Text style={styles.finishText}>
                    {isSaving ? 'SAVING...' : 'FINISH'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    flex: 1,
  },

  hud: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },

  statusBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textMuted,
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: COLORS.accent,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  bottomPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  plannedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  plannedLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  plannedValue: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  plannedMeta: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  clearButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '900',
  },

  statsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.4,
  },

  progressCard: {
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  progressPercent: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '900',
  },
  progressTrack: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  routeStatus: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
  },
  routeDist: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },

  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  typeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  typeTextActive: {
    color: COLORS.background,
  },

  controls: {},
  planButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  planText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  startButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  startText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pauseButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  pauseText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
  resumeButton: {
    flex: 1,
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  resumeText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '900',
  },
  finishButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  finishText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
});