import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
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

import {
  useNavigation,
} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  Coordinate,
  RootStackParamList,
} from '../../navigation/types';

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'RoutePlanner'
  >;

type ActivityType =
  | 'Run'
  | 'Walk'
  | 'Cycle';

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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const PLANNED_ROUTE_KEY =
  '@jogquest/planned_route';

const RoutePlannerScreen = () => {
  const navigation =
    useNavigation<Navigation>();

  const mapRef =
    useRef<MapView>(null);

  const routingTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const [
    activityType,
    setActivityType,
  ] = useState<ActivityType>(
    'Run',
  );

  const [
    points,
    setPoints,
  ] = useState<Coordinate[]>([]);

  const [
    routedRoute,
    setRoutedRoute,
  ] = useState<Coordinate[]>(
    [],
  );

  const [
    distanceKm,
    setDistanceKm,
  ] = useState(0);

  const [
    durationSeconds,
    setDurationSeconds,
  ] = useState(0);

  const [
    routing,
    setRouting,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      if (
        routingTimerRef.current
      ) {
        clearTimeout(
          routingTimerRef.current,
        );
      }
    };
  }, []);

  // --------------------------------------------------
  // REQUEST ROAD ROUTE
  // --------------------------------------------------

  const requestRoute = async (
    nextPoints: Coordinate[],
    nextActivityType: ActivityType,
  ) => {
    if (
      nextPoints.length < 2
    ) {
      setRoutedRoute([]);
      setDistanceKm(0);
      setDurationSeconds(0);
      setRouting(false);
      return;
    }

    try {
      setRouting(true);
      setError(null);

      const response =
        await fetch(
          `${API_BASE_URL}/api/routes`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              activityType:
                nextActivityType,

              points:
                nextPoints,
            }),
          },
        );

      const data =
        (await response.json()) as RouteApiResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Failed to generate route',
        );
      }

      if (
        !Array.isArray(
          data.route,
        ) ||
        data.route.length < 2
      ) {
        throw new Error(
          'Routing service returned an invalid route',
        );
      }

      setRoutedRoute(
        data.route,
      );

      setDistanceKm(
        Number(
          data.distanceKm,
        ),
      );

      setDurationSeconds(
        Number(
          data.durationSeconds,
        ),
      );

      // Fit the road route.
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          data.route.map(
            point => ({
              latitude:
                point.latitude,
              longitude:
                point.longitude,
            }),
          ),
          {
            edgePadding: {
              top: 190,
              right: 35,
              bottom: 320,
              left: 35,
            },
            animated: true,
          },
        );
      }, 100);
    } catch (err) {
      console.error(
        'Route generation failed:',
        err,
      );

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

  // --------------------------------------------------
  // DEBOUNCED ROUTING
  // --------------------------------------------------

  const scheduleRouteRequest = (
    nextPoints: Coordinate[],
    nextActivityType: ActivityType,
  ) => {
    if (
      routingTimerRef.current
    ) {
      clearTimeout(
        routingTimerRef.current,
      );
    }

    routingTimerRef.current =
      setTimeout(() => {
        requestRoute(
          nextPoints,
          nextActivityType,
        );
      }, 700);
  };

  // --------------------------------------------------
  // MAP PRESS
  // --------------------------------------------------

  const handleMapPress = (
    event: MapPressEvent,
  ) => {
    if (routing) {
      return;
    }

    const {
      latitude,
      longitude,
    } =
      event.nativeEvent.coordinate;

    const newPoint: Coordinate = {
      latitude,
      longitude,
    };

    setError(null);

    setPoints(
      currentPoints => {
        const nextPoints = [
          ...currentPoints,
          newPoint,
        ];

        scheduleRouteRequest(
          nextPoints,
          activityType,
        );

        return nextPoints;
      },
    );
  };

  // --------------------------------------------------
  // ACTIVITY TYPE
  // --------------------------------------------------

  const changeActivityType =
    (
      nextType: ActivityType,
    ) => {
      if (
        routing ||
        nextType ===
          activityType
      ) {
        return;
      }

      setActivityType(
        nextType,
      );

      if (
        points.length >= 2
      ) {
        scheduleRouteRequest(
          points,
          nextType,
        );
      }
    };

  // --------------------------------------------------
  // UNDO
  // --------------------------------------------------

  const undoLastPoint =
    () => {
      if (routing) {
        return;
      }

      setPoints(
        currentPoints => {
          const nextPoints =
            currentPoints.slice(
              0,
              -1,
            );

          if (
            nextPoints.length >=
            2
          ) {
            scheduleRouteRequest(
              nextPoints,
              activityType,
            );
          } else {
            setRoutedRoute(
              [],
            );

            setDistanceKm(
              0,
            );

            setDurationSeconds(
              0,
            );
          }

          return nextPoints;
        },
      );
    };

  // --------------------------------------------------
  // CLOSE LOOP
  // --------------------------------------------------

  const closeRoute =
    () => {
      if (
        routing ||
        points.length < 2
      ) {
        return;
      }

      const first =
        points[0];

      const last =
        points[
          points.length - 1
        ];

      const alreadyClosed =
        first.latitude ===
          last.latitude &&
        first.longitude ===
          last.longitude;

      if (alreadyClosed) {
        return;
      }

      const nextPoints = [
        ...points,
        {
          latitude:
            first.latitude,
          longitude:
            first.longitude,
        },
      ];

      setPoints(
        nextPoints,
      );

      scheduleRouteRequest(
        nextPoints,
        activityType,
      );
    };

  // --------------------------------------------------
  // CLEAR
  // --------------------------------------------------

  const clearRoute =
    () => {
      if (
        routing
      ) {
        return;
      }

      if (
        routingTimerRef.current
      ) {
        clearTimeout(
          routingTimerRef.current,
        );

        routingTimerRef.current =
          null;
      }

      setPoints([]);
      setRoutedRoute([]);
      setDistanceKm(0);
      setDurationSeconds(0);
      setError(null);
    };

  // --------------------------------------------------
  // SAVE
  // --------------------------------------------------

  const saveRoute =
    async () => {
      if (
        points.length < 2
      ) {
        Alert.alert(
          'Route too short',
          'Add at least two points to create a route.',
        );

        return;
      }

      if (
        routedRoute.length < 2
      ) {
        Alert.alert(
          'Route not ready',
          'Wait for the road route to finish generating.',
        );

        return;
      }

      try {
        setSaving(true);
        setError(null);

        const plannedRoute:
          PlannedRoute = {
            activityType,

            route:
              routedRoute,

            points,

            distanceKm,

            durationSeconds,

            savedAt:
              new Date().toISOString(),
          };

        await AsyncStorage.setItem(
          PLANNED_ROUTE_KEY,
          JSON.stringify(
            plannedRoute,
          ),
        );

        Alert.alert(
          'Route saved',
          `${distanceKm.toFixed(
            2,
          )} km road route saved.`,
          [
            {
              text: 'OK',
              onPress: () =>
                navigation.goBack(),
            },
          ],
        );
      } catch (err) {
        console.error(
          'Failed to save planned route:',
          err,
        );

        Alert.alert(
          'Save failed',
          'Could not save the planned route.',
        );
      } finally {
        setSaving(false);
      }
    };

  // --------------------------------------------------
  // FORMAT DURATION
  // --------------------------------------------------

  const formatDuration =
    (
      seconds: number,
    ) => {
      const total =
        Math.max(
          0,
          Math.round(
            seconds,
          ),
        );

      const minutes =
        Math.floor(
          total / 60,
        );

      const remainingSeconds =
        total % 60;

      if (
        minutes >= 60
      ) {
        const hours =
          Math.floor(
            minutes / 60,
          );

        const remainingMinutes =
          minutes % 60;

        return `${hours}h ${String(
          remainingMinutes,
        ).padStart(
          2,
          '0',
        )}m`;
      }

      return `${minutes}m ${String(
        remainingSeconds,
      ).padStart(
        2,
        '0',
      )}s`;
    };

  // --------------------------------------------------
  // DISPLAY ROUTE
  // --------------------------------------------------

  const displayRoute =
    routedRoute.length > 1
      ? routedRoute
      : points;

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
          onPress={
            handleMapPress
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
              SELECTED WAYPOINTS
              ========================================= */}

          {points.map(
            (
              point,
              index,
            ) => (
              <Marker
                key={`point-${index}-${point.latitude}-${point.longitude}`}
                coordinate={{
                  latitude:
                    point.latitude,

                  longitude:
                    point.longitude,
                }}
                title={`Waypoint ${
                  index + 1
                }`}
              />
            ),
          )}

          {/* =========================================
              ROAD ROUTE
              ========================================= */}

          {displayRoute.length >
            1 && (
            <Polyline
              coordinates={
                displayRoute
              }
              strokeWidth={5}
            />
          )}

        </MapView>

        {/* =========================================
            TOP CARD
            ========================================= */}

        <View
          style={
            styles.topCard
          }>

          <View
            style={
              styles.titleRow
            }>

            <View
              style={
                styles.titleBlock
              }>

              <Text
                style={
                  styles.title
                }>
                Plan Your Route
              </Text>

              <Text
                style={
                  styles.subtitle
                }>
                Tap the map to add waypoints
              </Text>

            </View>

            {routing && (
              <ActivityIndicator
                size="small"
                color="#fff"
              />
            )}

          </View>

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
            ).map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  activityType ===
                    type &&
                    styles.typeButtonActive,
                ]}
                onPress={() =>
                  changeActivityType(
                    type,
                  )
                }
                disabled={
                  routing
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
            ))}

          </View>

          {error && (
            <View
              style={
                styles.errorBox
              }>
              <Text
                style={
                  styles.errorText
                }>
                {error}
              </Text>
            </View>
          )}

        </View>

        {/* =========================================
            BOTTOM PANEL
            ========================================= */}

        <View
          style={
            styles.bottomPanel
          }>

          {/* ROUTE STATS */}

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
                {distanceKm.toFixed(
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
                {formatDuration(
                  durationSeconds,
                )}
              </Text>

              <Text
                style={
                  styles.statLabel
                }>
                EXPECTED
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
                {points.length}
              </Text>

              <Text
                style={
                  styles.statLabel
                }>
                WAYPOINTS
              </Text>

            </View>

          </View>

          {/* ACTIONS */}

          <View
            style={
              styles.actionRow
            }>

            <TouchableOpacity
              style={
                styles.smallButton
              }
              onPress={
                undoLastPoint
              }
              disabled={
                routing ||
                points.length === 0
              }>

              <Text
                style={
                  styles.smallButtonText
                }>
                UNDO
              </Text>

            </TouchableOpacity>

            <TouchableOpacity
              style={
                styles.smallButton
              }
              onPress={
                closeRoute
              }
              disabled={
                routing ||
                points.length < 2
              }>

              <Text
                style={
                  styles.smallButtonText
                }>
                CLOSE LOOP
              </Text>

            </TouchableOpacity>

            <TouchableOpacity
              style={
                styles.smallButton
              }
              onPress={
                clearRoute
              }
              disabled={
                routing ||
                points.length === 0
              }>

              <Text
                style={
                  styles.smallButtonText
                }>
                CLEAR
              </Text>

            </TouchableOpacity>

          </View>

          {/* SAVE */}

          <TouchableOpacity
            style={[
              styles.saveButton,
              (
                points.length < 2 ||
                routedRoute.length < 2 ||
                routing
              ) &&
                styles.saveButtonDisabled,
            ]}
            onPress={
              saveRoute
            }
            disabled={
              saving ||
              routing ||
              points.length < 2 ||
              routedRoute.length < 2
            }>

            {saving ? (
              <ActivityIndicator
                size="small"
                color="#000"
              />
            ) : (
              <Text
                style={
                  styles.saveButtonText
                }>
                SAVE ROUTE
              </Text>
            )}

          </TouchableOpacity>

        </View>

      </View>

    </SafeAreaView>
  );
};

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000',
    },

    mapContainer: {
      flex: 1,
    },

    map: {
      flex: 1,
    },

    topCard: {
      position:
        'absolute',

      top: 12,

      left: 14,

      right: 14,

      backgroundColor:
        '#000',

      borderRadius:
        18,

      padding: 16,
    },

    titleRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    titleBlock: {
      flex: 1,
    },

    title: {
      color: '#fff',

      fontSize: 20,

      fontWeight: '900',
    },

    subtitle: {
      color: '#777',

      fontSize: 11,

      marginTop: 4,
    },

    typeContainer: {
      flexDirection:
        'row',

      gap: 8,

      marginTop: 14,
    },

    typeButton: {
      flex: 1,

      height: 38,

      borderRadius:
        10,

      backgroundColor:
        '#111',

      borderWidth: 1,

      borderColor:
        '#333',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    typeButtonActive: {
      backgroundColor:
        '#fff',

      borderColor:
        '#fff',
    },

    typeText: {
      color: '#888',

      fontSize: 10,

      fontWeight:
        '900',
    },

    typeTextActive: {
      color: '#000',
    },

    errorBox: {
      backgroundColor:
        '#171717',

      borderWidth: 1,

      borderColor:
        '#333',

      borderRadius:
        10,

      padding: 9,

      marginTop: 10,
    },

    errorText: {
      color: '#aaa',

      fontSize: 10,

      lineHeight: 15,
    },

    bottomPanel: {
      position:
        'absolute',

      left: 14,

      right: 14,

      bottom: 14,
    },

    statsCard: {
      flexDirection:
        'row',

      backgroundColor:
        '#000',

      borderRadius:
        18,

      paddingVertical:
        16,

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

      fontWeight:
        '900',
    },

    statLabel: {
      color: '#666',

      fontSize: 8,

      fontWeight:
        '800',

      marginTop: 4,

      textAlign:
        'center',
    },

    divider: {
      width: 1,

      backgroundColor:
        '#292929',
    },

    actionRow: {
      flexDirection:
        'row',

      gap: 8,

      marginBottom:
        8,
    },

    smallButton: {
      flex: 1,

      minHeight: 42,

      borderRadius:
        11,

      backgroundColor:
        '#111',

      borderWidth: 1,

      borderColor:
        '#333',

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingHorizontal:
        6,
    },

    smallButtonText: {
      color: '#fff',

      fontSize: 8,

      fontWeight:
        '900',

      textAlign:
        'center',
    },

    saveButton: {
      height: 52,

      backgroundColor:
        '#fff',

      borderRadius:
        14,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    saveButtonDisabled: {
      backgroundColor:
        '#333',
    },

    saveButtonText: {
      color: '#000',

      fontSize: 10,

      fontWeight:
        '900',
    },
  });

export default RoutePlannerScreen;