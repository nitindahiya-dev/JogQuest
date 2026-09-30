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
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { createTerritory } from '../../utils/territory';
import { saveTerritory } from '../../utils/territoryStorage';

import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

import {
  calculateDistance,
  Coordinate,
  formatTime,
} from '../../utils/geo';

type NavigationProp =
  NativeStackNavigationProp<
    RootStackParamList
  >;

type ActivityType =
  'Run' | 'Walk' | 'Cycle';

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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const PLANNED_ROUTE_KEY =
  '@jogquest/planned_route';

const ActivityScreen = () => {
  const navigation =
    useNavigation<NavigationProp>();

  const mapRef =
    useRef<MapView>(null);

  const [
    activityType,
    setActivityType,
  ] = useState<ActivityType>('Run');

  const [
    isTracking,
    setIsTracking,
  ] = useState(false);

  const [
    isPaused,
    setIsPaused,
  ] = useState(false);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    route,
    setRoute,
  ] = useState<Coordinate[]>([]);

  const [
    plannedRoute,
    setPlannedRoute,
  ] = useState<PlannedRoute | null>(
    null,
  );

  const [
    distance,
    setDistance,
  ] = useState(0);

  const [
    elapsedSeconds,
    setElapsedSeconds,
  ] = useState(0);

  const startTimeRef =
    useRef<number | null>(null);

  const startedAtRef =
    useRef<string | null>(null);

  const lastLocationRef =
    useRef<Coordinate | null>(null);

  const routeProgressMaxRef =
    useRef(0);

  // --------------------------------------------------
  // LOAD PLANNED ROUTE
  // --------------------------------------------------

  const loadPlannedRoute =
    useCallback(async () => {
      try {
        const stored =
          await AsyncStorage.getItem(
            PLANNED_ROUTE_KEY,
          );

        if (!stored) {
          setPlannedRoute(null);
          return;
        }

        const parsed =
          JSON.parse(
            stored,
          ) as Partial<PlannedRoute>;

        if (
          !parsed.activityType ||
          !Array.isArray(parsed.route) ||
          parsed.route.length < 2 ||
          typeof parsed.distanceKm !==
          'number'
        ) {
          setPlannedRoute(null);
          return;
        }

        const nextRoute: PlannedRoute = {
          activityType:
            parsed.activityType,
          route:
            parsed.route,
          distanceKm:
            parsed.distanceKm,
          savedAt:
            parsed.savedAt ??
            new Date().toISOString(),
        };

        setPlannedRoute(
          nextRoute,
        );

        setActivityType(
          nextRoute.activityType,
        );
      } catch (error) {
        console.error(
          'Failed to load planned route:',
          error,
        );

        setPlannedRoute(null);
      }
    }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlannedRoute();
    }, [
      loadPlannedRoute,
    ]),
  );

  // --------------------------------------------------
  // FIT MAP TO PLANNED ROUTE
  // --------------------------------------------------

  useEffect(() => {
    if (
      !plannedRoute ||
      plannedRoute.route.length < 2
    ) {
      return;
    }

    const timer =
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          plannedRoute.route.map(
            point => ({
              latitude:
                point.latitude,
              longitude:
                point.longitude,
            }),
          ),
          {
            edgePadding: {
              top: 170,
              right: 35,
              bottom: 310,
              left: 35,
            },
            animated: true,
          },
        );
      }, 350);

    return () =>
      clearTimeout(timer);
  }, [plannedRoute]);

  // --------------------------------------------------
  // LOCATION PERMISSION
  // --------------------------------------------------

  useEffect(() => {
    const requestLocationPermission =
      async () => {
        if (
          Platform.OS !==
          'android'
        ) {
          return;
        }

        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS
            .ACCESS_FINE_LOCATION,
        );
      };

    requestLocationPermission();
  }, []);

  // --------------------------------------------------
  // TIMER
  // --------------------------------------------------

  useEffect(() => {
    if (
      !isTracking ||
      isPaused
    ) {
      return;
    }

    const timer =
      setInterval(() => {
        if (
          !startTimeRef.current
        ) {
          return;
        }

        const elapsed =
          Math.floor(
            (Date.now() -
              startTimeRef.current) /
            1000,
          );

        setElapsedSeconds(
          elapsed,
        );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, [
    isTracking,
    isPaused,
  ]);

  // --------------------------------------------------
  // GPS LOCATION
  // --------------------------------------------------

  const handleLocationChange =
    (event: any) => {
      if (
        !isTracking ||
        isPaused
      ) {
        return;
      }

      const coordinate:
        Coordinate =
        event.nativeEvent
          .coordinate;

      if (!coordinate) {
        return;
      }

      // Ignore poor GPS readings.
      if (
        typeof coordinate.accuracy ===
        'number' &&
        coordinate.accuracy >
        50
      ) {
        return;
      }

      const lastLocation =
        lastLocationRef.current;

      // First GPS point.
      if (!lastLocation) {
        lastLocationRef.current =
          coordinate;

        setRoute([
          coordinate,
        ]);

        return;
      }

      const segmentDistance =
        calculateDistance(
          lastLocation,
          coordinate,
        );

      // Ignore GPS noise smaller than 3 meters.
      if (
        segmentDistance <
        0.003
      ) {
        return;
      }

      // Ignore impossible GPS jumps.
      if (
        segmentDistance >
        0.5
      ) {
        return;
      }

      setDistance(
        current =>
          current +
          segmentDistance,
      );

      setRoute(
        current => [
          ...current,
          coordinate,
        ],
      );

      lastLocationRef.current =
        coordinate;
    };

  // --------------------------------------------------
  // START
  // --------------------------------------------------

  const startActivity =
    () => {
      setRoute([]);
      setDistance(0);
      routeProgressMaxRef.current = 0;
      setElapsedSeconds(0);
      setIsPaused(false);
      setIsSaving(false);

      lastLocationRef.current =
        null;

      startTimeRef.current =
        Date.now();

      startedAtRef.current =
        new Date().toISOString();

      setIsTracking(true);
    };

  // --------------------------------------------------
  // PAUSE
  // --------------------------------------------------

  const pauseActivity =
    () => {
      setIsPaused(true);

      lastLocationRef.current =
        null;
    };

  // --------------------------------------------------
  // RESUME
  // --------------------------------------------------

  const resumeActivity =
    () => {
      setIsPaused(false);

      lastLocationRef.current =
        null;
    };

  // --------------------------------------------------
  // CLEAR PLANNED ROUTE
  // --------------------------------------------------

  const clearPlannedRoute =
    async () => {
      try {
        await AsyncStorage.removeItem(
          PLANNED_ROUTE_KEY,
        );

        setPlannedRoute(
          null,
        );
      } catch (error) {
        console.error(
          'Failed to clear planned route:',
          error,
        );
      }
    };

// --------------------------------------------------
// ROUTE PROGRESS CALCULATION
// --------------------------------------------------

const clamp01 = (value: number) =>
  Math.max(0, Math.min(1, value));

const getProjectedPointOnSegment = (
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): Coordinate => {
  const latRadians =
    (start.latitude * Math.PI) /
    180;

  const metersPerLatitudeDegree =
    111_320;

  const metersPerLongitudeDegree =
    111_320 *
    Math.cos(latRadians);

  const pointX =
    (point.longitude -
      start.longitude) *
    metersPerLongitudeDegree;

  const pointY =
    (point.latitude -
      start.latitude) *
    metersPerLatitudeDegree;

  const segmentX =
    (end.longitude -
      start.longitude) *
    metersPerLongitudeDegree;

  const segmentY =
    (end.latitude -
      start.latitude) *
    metersPerLatitudeDegree;

  const segmentLengthSquared =
    segmentX * segmentX +
    segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return start;
  }

  const projection = clamp01(
    (pointX * segmentX +
      pointY * segmentY) /
      segmentLengthSquared,
  );

  return {
    latitude:
      start.latitude +
      (end.latitude -
        start.latitude) *
        projection,

    longitude:
      start.longitude +
      (end.longitude -
        start.longitude) *
        projection,
  };
};

const getRouteProgress = () => {
  if (
    !plannedRoute ||
    route.length === 0 ||
    plannedRoute.route.length < 2
  ) {
    return {
      progress: 0,
      distanceFromRoute:
        null as number | null,
      status: 'WAITING FOR GPS',
    };
  }

  const currentPoint =
    route[route.length - 1];

  let nearestDistance =
    Number.POSITIVE_INFINITY;

  let distanceAlongRoute = 0;

  let cumulativeDistance = 0;

  let nearestDistanceAlongRoute = 0;

  for (
    let index = 0;
    index <
    plannedRoute.route.length - 1;
    index += 1
  ) {
    const segmentStart =
      plannedRoute.route[index];

    const segmentEnd =
      plannedRoute.route[index + 1];

    const segmentLength =
      calculateDistance(
        segmentStart,
        segmentEnd,
      );

    const projectedPoint =
      getProjectedPointOnSegment(
        currentPoint,
        segmentStart,
        segmentEnd,
      );

    const distanceToSegment =
      calculateDistance(
        currentPoint,
        projectedPoint,
      );

    if (
      distanceToSegment <
      nearestDistance
    ) {
      nearestDistance =
        distanceToSegment;

      distanceAlongRoute =
        cumulativeDistance +
        calculateDistance(
          segmentStart,
          projectedPoint,
        );

      nearestDistanceAlongRoute =
        distanceAlongRoute;
    }

    cumulativeDistance +=
      segmentLength;
  }

  const totalRouteDistance =
    cumulativeDistance;

  const endpoint =
    plannedRoute.route[
      plannedRoute.route.length - 1
    ];

  const distanceToEndpoint =
    calculateDistance(
      currentPoint,
      endpoint,
    );

  // A GPS position within 50 m of the
  // planned endpoint completes the route.
  const completed =
    distanceToEndpoint <= 0.05;

  const isNearRoute =
    nearestDistance <= 0.15;

  const candidateProgress =
    totalRouteDistance > 0
      ? Math.min(
          100,
          (nearestDistanceAlongRoute /
            totalRouteDistance) *
            100,
        )
      : 0;

  // Never let an off-route GPS fix move the
  // runner forward along the planned route.
  if (completed) {
    routeProgressMaxRef.current =
      100;
  } else if (isNearRoute) {
    routeProgressMaxRef.current =
      Math.max(
        routeProgressMaxRef.current,
        candidateProgress,
      );
  }

  const progress =
    routeProgressMaxRef.current;

  const status =
    nearestDistance <= 0.05
      ? 'ON ROUTE'
      : nearestDistance <= 0.15
        ? 'NEAR ROUTE'
        : 'OFF ROUTE';

  return {
    progress,
    distanceFromRoute:
      nearestDistance,
    status,
  };
};

const routeProgressInfo =
  getRouteProgress();

const routeProgress =
  routeProgressInfo.progress;

const nearestPlannedDistance =
  routeProgressInfo.distanceFromRoute;

const routeStatus =
  routeProgressInfo.status;

const plannedDistance =
  plannedRoute?.distanceKm ?? 0;

  // --------------------------------------------------
  // PACE
  // --------------------------------------------------

  const calculatePace =
    (
      distanceKm = distance,
      seconds = elapsedSeconds,
    ) => {
      if (
        distanceKm <=
        0.01
      ) {
        return '--';
      }

      const secondsPerKm =
        seconds /
        distanceKm;

      const minutes =
        Math.floor(
          secondsPerKm /
          60,
        );

      const remainingSeconds =
        Math.floor(
          secondsPerKm %
          60,
        );

      return `${minutes}:${String(
        remainingSeconds,
      ).padStart(
        2,
        '0',
      )}`;
    };

  // --------------------------------------------------
  // SAVE ACTIVITY TO BACKEND
  // --------------------------------------------------

  const saveActivityToBackend =
    async (
      finalTime: number,
      pace: string,
      territory: ReturnType<
        typeof createTerritory
      >,
    ): Promise<CreateActivityResponse> => {
      const finishedAt =
        new Date().toISOString();

      const response =
        await fetch(
          `${API_BASE_URL}/api/activities`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              userId:
                DEV_USER_ID,

              activityType,

              distanceKm:
                distance,

              elapsedSeconds:
                finalTime,

              pace,

              startedAt:
                startedAtRef.current ??
                undefined,

              finishedAt,

              route,

              territory:
                territory.captured
                  ? {
                    areaM2:
                      territory.areaM2,

                    areaKm2:
                      territory.areaKm2,

                    polygon:
                      territory.polygon,
                  }
                  : undefined,
            }),
          },
        );

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          `Backend returned ${response.status}: ${errorText}`,
        );
      }

      return (await response.json()) as
        CreateActivityResponse;
    };

  // --------------------------------------------------
  // CLAIM TERRITORY ON BACKEND
  // --------------------------------------------------

  const claimTerritoryOnBackend =
    async (
      activityId: string,
      territory: ReturnType<
        typeof createTerritory
      >,
    ) => {
      if (
        !territory.captured
      ) {
        return null;
      }

      const response =
        await fetch(
          `${API_BASE_URL}/api/territories/claim`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              userId:
                DEV_USER_ID,

              activityId,

              activityType,

              polygon:
                territory.polygon,
            }),
          },
        );

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          `Territory claim failed (${response.status}): ${errorText}`,
        );
      }

      return response.json();
    };

  // --------------------------------------------------
  // FINISH
  // --------------------------------------------------

const stopActivity = async () => {
  if (isSaving) {
    return;
  }

  setIsSaving(true);

  const finalTime =
    startTimeRef.current
      ? Math.floor(
          (Date.now() -
            startTimeRef.current) /
            1000,
        )
      : 0;

  const finalPace =
    calculatePace(
      distance,
      finalTime,
    );

  const territory =
    createTerritory(
      route,
    );

  let resultTerritory =
    territory;

  try {
    // ----------------------------------------------
    // 1. ALWAYS SAVE THE ACTIVITY FIRST
    // ----------------------------------------------

    const activityResponse =
      await saveActivityToBackend(
        finalTime,
        finalPace,
        territory,
      );

    // ----------------------------------------------
    // 2. TRY SERVER-SIDE TERRITORY CLAIM
    // ----------------------------------------------

    if (
      territory.captured &&
      activityResponse?.activity?.id
    ) {
      try {
        await claimTerritoryOnBackend(
          activityResponse.activity.id,
          territory,
        );

        // Only persist locally after the server
        // confirms the territory claim.
        await saveTerritory({
          id: `territory-${Date.now()}`,

          areaM2:
            territory.areaM2,

          areaKm2:
            territory.areaKm2,

          polygon:
            territory.polygon,

          activityType,

          capturedAt:
            new Date().toISOString(),
        });
      } catch (territoryError) {
        console.warn(
          'Territory claim failed:',
          territoryError,
        );

        // The activity succeeded, but the territory
        // was not captured.
        resultTerritory = {
          ...territory,
          captured: false,
        };

        const message =
          territoryError instanceof
          Error
            ? territoryError.message
            : 'Territory could not be captured.';

        Alert.alert(
          'Activity Saved',
          message.includes(
            '409',
          ) ||
          message.includes(
            'Territory overlaps',
          )
            ? 'Your activity was saved successfully, but this territory overlaps an existing territory and was not captured.'
            : 'Your activity was saved successfully, but the territory could not be captured.',
        );
      }
    }

    // ----------------------------------------------
    // 3. FINISH THE ACTIVITY REGARDLESS OF
    //    TERRITORY CLAIM RESULT
    // ----------------------------------------------

    setElapsedSeconds(
      finalTime,
    );

    setIsTracking(
      false,
    );

    setIsPaused(
      false,
    );

    setIsSaving(
      false,
    );

    startTimeRef.current =
      null;

    startedAtRef.current =
      null;

    lastLocationRef.current =
      null;

    navigation.navigate(
      'ActivityResult',
      {
        activityType,

        distance,

        elapsedSeconds:
          finalTime,

        pace:
          finalPace,

        route,

        territory:
          resultTerritory,
      },
    );
  } catch (error) {
    console.error(
      'Failed to save activity:',
      error,
    );

    setIsSaving(false);

    Alert.alert(
      'Activity Save Failed',
      'The activity could not be saved to the server. Please try again.',
    );
  }
};

  return (
    <SafeAreaView
      style={
        styles.container
      }>

      <View
        style={
          styles.mapContainer
        }>

        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          showsMyLocationButton
          userLocationPriority="high"
          userLocationUpdateInterval={
            3000
          }
          userLocationFastestInterval={
            2000
          }
          onUserLocationChange={
            handleLocationChange
          }
          initialRegion={{
            latitude:
              28.6139,

            longitude:
              77.209,

            latitudeDelta:
              0.03,

            longitudeDelta:
              0.03,
          }}>

          {/* =========================================
              PLANNED ROUTE
              ========================================= */}

          {plannedRoute &&
            plannedRoute.route
              .length > 1 && (
              <Polyline
                coordinates={
                  plannedRoute.route
                }
                strokeWidth={4}
                lineDashPattern={[
                  10,
                  7,
                ]}
              />
            )}

          {/* PLANNED ROUTE START */}

          {plannedRoute &&
            plannedRoute.route
              .length > 0 && (
              <Marker
                coordinate={{
                  latitude:
                    plannedRoute
                      .route[0]
                      .latitude,

                  longitude:
                    plannedRoute
                      .route[0]
                      .longitude,
                }}
                title="Route Start"
                description="Planned route start"
              />
            )}

          {/* PLANNED ROUTE END */}

          {plannedRoute &&
            plannedRoute.route
              .length > 1 && (
              <Marker
                coordinate={{
                  latitude:
                    plannedRoute
                      .route[
                      plannedRoute.route
                        .length -
                      1
                    ]
                      .latitude,

                  longitude:
                    plannedRoute
                      .route[
                      plannedRoute.route
                        .length -
                      1
                    ]
                      .longitude,
                }}
                title="Route End"
                description="Planned route end"
              />
            )}

          {/* =========================================
              LIVE GPS ROUTE
              ========================================= */}

          {route.length >
            1 && (
              <Polyline
                coordinates={
                  route
                }
                strokeWidth={5}
              />
            )}

        </MapView>

        <View
          style={styles.overlay}
          pointerEvents="box-none">

          {/* =========================================
              TOP STATUS
              ========================================= */}

          <View
            style={
              styles.statusBadge
            }>

            <Text
              style={
                styles.statusText
              }>
              {isSaving
                ? 'SAVING ACTIVITY...'
                : isTracking
                  ? isPaused
                    ? 'PAUSED'
                    : `${activityType.toUpperCase()} IN PROGRESS`
                  : plannedRoute
                    ? 'ROUTE READY'
                    : 'START ACTIVITY'}
            </Text>

          </View>

          {/* =========================================
              BOTTOM CONTENT
              ========================================= */}

          <View
            style={
              styles.bottomContent
            }>

            {/* PLANNED ROUTE CARD */}

            {!isTracking &&
              plannedRoute && (
                <View
                  style={
                    styles.plannedRouteCard
                  }>

                  <View
                    style={
                      styles.plannedInfo
                    }>

                    <Text
                      style={
                        styles.plannedTitle
                      }>
                      PLANNED ROUTE
                    </Text>

                    <Text
                      style={
                        styles.plannedValue
                      }>
                      {plannedRoute.distanceKm.toFixed(
                        2,
                      )}{' '}
                      km
                    </Text>

                    <Text
                      style={
                        styles.plannedSubtitle
                      }>
                      {plannedRoute.activityType.toUpperCase()}
                      {' • '}
                      {plannedRoute.route.length}{' '}
                      POINTS
                    </Text>

                  </View>

                  <TouchableOpacity
                    style={
                      styles.clearPlanButton
                    }
                    onPress={
                      clearPlannedRoute
                    }>

                    <Text
                      style={
                        styles.clearPlanText
                      }>
                      CLEAR
                    </Text>

                  </TouchableOpacity>

                </View>
              )}

            {/* Route progress card */}

            {isTracking &&
              plannedRoute && (
                <View
                  style={
                    styles.progressCard
                  }>

                  <View
                    style={
                      styles.progressHeader
                    }>

                    <View>
                      <Text
                        style={
                          styles.progressTitle
                        }>
                        ROUTE PROGRESS
                      </Text>

                      <Text
                        style={
                          styles.progressSubtitle
                        }>
                        {distance.toFixed(2)} km /{' '}
                        {plannedDistance.toFixed(2)} km
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.progressPercent
                      }>
                      {Math.round(
                        routeProgress,
                      )}%
                    </Text>

                  </View>

                  <View
                    style={
                      styles.progressTrack
                    }>

                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${routeProgress}%`,
                        },
                      ]}
                    />

                  </View>

                  <View
                    style={
                      styles.routeStatusRow
                    }>

                    <Text
                      style={
                        styles.routeStatusText
                      }>
                      {routeStatus}
                    </Text>

                    {nearestPlannedDistance !==
                      null && (
                        <Text
                          style={
                            styles.routeDistanceText
                          }>
                          {Math.round(
                            nearestPlannedDistance *
                            1000,
                          )}{' '}
                          m from route
                        </Text>
                      )}

                  </View>

                </View>
              )}

            {/* =====================================
                STATS
                ===================================== */}

            <View
              style={
                styles.statsCard
              }>

              <View
                style={
                  styles.stat
                }>

                <Text
                  style={
                    styles.statValue
                  }>
                  {distance.toFixed(
                    2,
                  )}
                </Text>

                <Text
                  style={
                    styles.statLabel
                  }>
                  KM
                </Text>

              </View>

              <View
                style={
                  styles.divider
                }
              />

              <View
                style={
                  styles.stat
                }>

                <Text
                  style={
                    styles.statValue
                  }>
                  {formatTime(
                    elapsedSeconds,
                  )}
                </Text>

                <Text
                  style={
                    styles.statLabel
                  }>
                  TIME
                </Text>

              </View>

              <View
                style={
                  styles.divider
                }
              />

              <View
                style={
                  styles.stat
                }>

                <Text
                  style={
                    styles.statValue
                  }>
                  {calculatePace()}
                </Text>

                <Text
                  style={
                    styles.statLabel
                  }>
                  PACE / KM
                </Text>

              </View>

              <View
                style={
                  styles.divider
                }
              />

              <View
                style={
                  styles.stat
                }>

                <Text
                  style={
                    styles.statValue
                  }>
                  {route.length}
                </Text>

                <Text
                  style={
                    styles.statLabel
                  }>
                  GPS
                </Text>

              </View>

            </View>

            {/* =====================================
                ACTIVITY TYPE
                ===================================== */}

            {!isTracking && (
              <View
                style={
                  styles.typeContainer
                }>

                {(
                  [
                    'Run',
                    'Walk',
                    'Cycle',
                  ] as ActivityType[]
                ).map(
                  type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,

                        activityType ===
                        type &&
                        styles.typeButtonActive,
                      ]}
                      onPress={() =>
                        setActivityType(
                          type,
                        )
                      }>

                      <Text
                        style={[
                          styles.typeText,

                          activityType ===
                          type &&
                          styles.typeTextActive,
                        ]}>
                        {type}
                      </Text>

                    </TouchableOpacity>
                  ),
                )}

              </View>
            )}

            {/* =====================================
                CONTROLS
                ===================================== */}

            <View
              style={
                styles.controls
              }>

              {!isTracking && (
                <>
                  <TouchableOpacity
                    style={
                      styles.planRouteButton
                    }
                    onPress={() =>
                      navigation.navigate(
                        'RoutePlanner',
                      )
                    }>

                    <Text
                      style={
                        styles.planRouteText
                      }>
                      {plannedRoute
                        ? 'EDIT ROUTE'
                        : 'PLAN ROUTE'}
                    </Text>

                  </TouchableOpacity>

                  <TouchableOpacity
                    style={
                      styles.startButton
                    }
                    onPress={
                      startActivity
                    }>

                    <Text
                      style={
                        styles.buttonText
                      }>
                      START{' '}
                      {activityType.toUpperCase()}
                    </Text>

                  </TouchableOpacity>
                </>
              )}

              {isTracking &&
                !isPaused && (
                  <View
                    style={
                      styles.buttonRow
                    }>

                    <TouchableOpacity
                      style={
                        styles.pauseButton
                      }
                      onPress={
                        pauseActivity
                      }>

                      <Text
                        style={
                          styles.buttonText
                        }>
                        PAUSE
                      </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                      style={
                        styles.finishButton
                      }
                      onPress={
                        stopActivity
                      }
                      disabled={
                        isSaving
                      }>

                      <Text
                        style={
                          styles.buttonText
                        }>
                        FINISH
                      </Text>

                    </TouchableOpacity>

                  </View>
                )}

              {isTracking &&
                isPaused && (
                  <View
                    style={
                      styles.buttonRow
                    }>

                    <TouchableOpacity
                      style={
                        styles.resumeButton
                      }
                      onPress={
                        resumeActivity
                      }>

                      <Text
                        style={
                          styles.buttonText
                        }>
                        RESUME
                      </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                      style={
                        styles.finishButton
                      }
                      onPress={
                        stopActivity
                      }
                      disabled={
                        isSaving
                      }>

                      <Text
                        style={
                          styles.buttonText
                        }>
                        FINISH
                      </Text>

                    </TouchableOpacity>

                  </View>
                )}

            </View>

          </View>

        </View>

      </View>

    </SafeAreaView>
  );
};

export default ActivityScreen;

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },

    mapContainer: {
      flex: 1,
    },

    map: {
      flex: 1,
    },

    overlay: {
      position: 'absolute',
      left: 15,
      right: 15,
      top: 15,
      bottom: 15,
      justifyContent:
        'space-between',
    },

    statusBadge: {
      alignSelf:
        'center',

      backgroundColor:
        '#000',

      paddingHorizontal:
        18,

      paddingVertical:
        10,

      borderRadius:
        18,
    },

    statusText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '800',
    },

    bottomContent: {
      width: '100%',
    },

    plannedRouteCard: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      backgroundColor:
        '#000',

      borderRadius:
        18,

      paddingHorizontal:
        16,

      paddingVertical:
        13,

      marginBottom:
        10,
    },

    plannedInfo: {
      flex: 1,
    },

    plannedTitle: {
      color: '#777',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.5,
    },

    plannedValue: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '900',
      marginTop: 3,
    },

    plannedSubtitle: {
      color: '#666',
      fontSize: 8,
      fontWeight: '700',
      marginTop: 3,
    },

    clearPlanButton: {
      backgroundColor:
        '#111',

      borderWidth: 1,

      borderColor:
        '#333',

      borderRadius:
        10,

      paddingHorizontal:
        10,

      paddingVertical:
        8,

      marginLeft: 10,
    },

    clearPlanText: {
      color: '#fff',
      fontSize: 8,
      fontWeight: '900',
    },

    statsCard: {
      flexDirection:
        'row',

      backgroundColor:
        '#000',

      borderRadius:
        20,

      paddingVertical:
        17,

      marginBottom:
        10,
    },

    stat: {
      flex: 1,
      alignItems:
        'center',
    },

    statValue: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800',
    },

    statLabel: {
      color: '#777',
      fontSize: 8,
      marginTop: 4,
      fontWeight: '700',
      textAlign: 'center',
    },

    divider: {
      width: 1,
      backgroundColor:
        '#292929',
    },

    typeContainer: {
      flexDirection:
        'row',

      gap: 8,

      marginBottom:
        10,
    },

    typeButton: {
      flex: 1,

      paddingVertical:
        12,

      borderRadius:
        14,

      backgroundColor:
        '#000',

      borderWidth: 1,

      borderColor:
        '#333',

      alignItems:
        'center',
    },

    typeButtonActive: {
      backgroundColor:
        '#fff',

      borderColor:
        '#fff',
    },

    typeText: {
      color: '#aaa',
      fontWeight: '700',
      fontSize: 11,
    },

    typeTextActive: {
      color: '#000',
    },

    controls: {
      marginBottom: 5,
    },

    buttonRow: {
      flexDirection:
        'row',

      gap: 10,
    },

    planRouteButton: {
      backgroundColor:
        '#111',

      borderWidth: 1,

      borderColor:
        '#333',

      paddingVertical:
        14,

      borderRadius:
        17,

      alignItems:
        'center',

      marginBottom:
        8,
    },

    planRouteText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
    },

    startButton: {
      backgroundColor:
        '#fff',

      paddingVertical:
        17,

      borderRadius:
        18,

      alignItems:
        'center',
    },

    pauseButton: {
      flex: 1,

      backgroundColor:
        '#fff',

      paddingVertical:
        17,

      borderRadius:
        18,

      alignItems:
        'center',
    },

    resumeButton: {
      flex: 1,

      backgroundColor:
        '#fff',

      paddingVertical:
        17,

      borderRadius:
        18,

      alignItems:
        'center',
    },

    finishButton: {
      flex: 1,

      backgroundColor:
        '#fff',

      paddingVertical:
        17,

      borderRadius:
        18,

      alignItems:
        'center',
    },

    buttonText: {
      color: '#000',
      fontWeight: '900',
      fontSize: 11,
    },

    progressCard: {
      backgroundColor: '#000',
      borderRadius: 18,
      padding: 15,
      marginBottom: 10,
    },

    progressHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    progressTitle: {
      color: '#777',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.5,
    },

    progressSubtitle: {
      color: '#aaa',
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
    },

    progressPercent: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '900',
    },

    progressTrack: {
      height: 7,
      backgroundColor: '#252525',
      borderRadius: 4,
      overflow: 'hidden',
      marginTop: 12,
    },

    progressFill: {
      height: '100%',
      backgroundColor: '#fff',
      borderRadius: 4,
    },

    routeStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 9,
    },

    routeStatusText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '900',
    },

    routeDistanceText: {
      color: '#666',
      fontSize: 8,
      fontWeight: '700',
    },
  });