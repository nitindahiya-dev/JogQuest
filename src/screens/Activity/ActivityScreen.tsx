import React, { useEffect, useRef, useState } from 'react';
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
import { createTerritory } from '../../utils/territory';
import { saveTerritory } from '../../utils/territoryStorage';

import MapView, {
  PROVIDER_GOOGLE,
  Polyline,
} from 'react-native-maps';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';

import {
  calculateDistance,
  Coordinate,
  formatTime,
} from '../../utils/geo';

type NavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

type ActivityType = 'Run' | 'Walk' | 'Cycle';

const API_BASE_URL = 'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

type CreateActivityResponse = {
  ok: boolean;
  activity: {
    id: string;
    created_at: string;
  };
};

const ActivityScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  const mapRef = useRef<MapView>(null);

  const [activityType, setActivityType] =
    useState<ActivityType>('Run');

  const [isTracking, setIsTracking] =
    useState(false);

  const [isPaused, setIsPaused] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [route, setRoute] =
    useState<Coordinate[]>([]);

  const [distance, setDistance] =
    useState(0);

  const [elapsedSeconds, setElapsedSeconds] =
    useState(0);

  const startTimeRef =
    useRef<number | null>(null);

  const startedAtRef =
    useRef<string | null>(null);

  const lastLocationRef =
    useRef<Coordinate | null>(null);

  // --------------------------------------------------
  // LOCATION PERMISSION
  // --------------------------------------------------

  useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS !== 'android') {
        return;
      }

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
    if (!isTracking || isPaused) {
      return;
    }

    const timer = setInterval(() => {
      if (!startTimeRef.current) {
        return;
      }

      const elapsed = Math.floor(
        (Date.now() - startTimeRef.current) / 1000,
      );

      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTracking, isPaused]);

  // --------------------------------------------------
  // GPS LOCATION
  // --------------------------------------------------

  const handleLocationChange = (event: any) => {
    if (!isTracking || isPaused) {
      return;
    }

    const coordinate: Coordinate =
      event.nativeEvent.coordinate;

    if (!coordinate) {
      return;
    }

    // Ignore poor GPS readings when accuracy is available.
    if (
      typeof coordinate.accuracy === 'number' &&
      coordinate.accuracy > 50
    ) {
      return;
    }

    const lastLocation =
      lastLocationRef.current;

    // First GPS point.
    if (!lastLocation) {
      lastLocationRef.current = coordinate;

      setRoute([coordinate]);

      return;
    }

    const segmentDistance =
      calculateDistance(
        lastLocation,
        coordinate,
      );

    // Ignore GPS noise smaller than 3 meters.
    if (segmentDistance < 0.003) {
      return;
    }

    // Ignore impossible GPS jumps larger than 500 meters
    // between two updates.
    if (segmentDistance > 0.5) {
      return;
    }

    setDistance(current =>
      current + segmentDistance,
    );

    setRoute(current => [
      ...current,
      coordinate,
    ]);

    lastLocationRef.current =
      coordinate;
  };

  // --------------------------------------------------
  // START
  // --------------------------------------------------

  const startActivity = () => {
    setRoute([]);
    setDistance(0);
    setElapsedSeconds(0);
    setIsPaused(false);
    setIsSaving(false);

    lastLocationRef.current = null;

    startTimeRef.current =
      Date.now();

    startedAtRef.current =
      new Date().toISOString();

    setIsTracking(true);
  };

  // --------------------------------------------------
  // PAUSE
  // --------------------------------------------------

  const pauseActivity = () => {
    setIsPaused(true);

    // Important:
    // clear the last GPS point so that
    // distance is not calculated across
    // the paused period.
    lastLocationRef.current = null;
  };

  // --------------------------------------------------
  // RESUME
  // --------------------------------------------------

  const resumeActivity = () => {
    setIsPaused(false);

    // Get a fresh GPS point after resuming.
    lastLocationRef.current = null;
  };

  // --------------------------------------------------
  // PACE
  // --------------------------------------------------

  const calculatePace = (
    distanceKm = distance,
    seconds = elapsedSeconds,
  ) => {
    if (distanceKm <= 0.01) {
      return '--';
    }

    const secondsPerKm =
      seconds / distanceKm;

    const minutes =
      Math.floor(secondsPerKm / 60);

    const remainingSeconds =
      Math.floor(secondsPerKm % 60);

    return `${minutes}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`;
  };

  // --------------------------------------------------
  // SAVE ACTIVITY TO BACKEND
  // --------------------------------------------------

  const saveActivityToBackend = async (
    finalTime: number,
    pace: string,
    territory: ReturnType<typeof createTerritory>,
  ): Promise<CreateActivityResponse> => {
    const finishedAt =
      new Date().toISOString();

    const response = await fetch(
      `${API_BASE_URL}/api/activities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: DEV_USER_ID,
          activityType,
          distanceKm: distance,
          elapsedSeconds: finalTime,
          pace,
          startedAt:
            startedAtRef.current ?? undefined,
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
      },
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `Backend returned ${response.status}: ${errorText}`,
      );
    }

    return (await response.json()) as CreateActivityResponse;
  };

  const claimTerritoryOnBackend = async (
    activityId: string,
    territory: ReturnType<typeof createTerritory>,
  ) => {
    if (!territory.captured) {
      return null;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/territories/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: DEV_USER_ID,
          activityId,
          activityType,
          polygon: territory.polygon,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

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

    const finalTime = startTimeRef.current
      ? Math.floor(
        (Date.now() - startTimeRef.current) / 1000,
      )
      : 0;

    const finalPace =
      calculatePace(distance, finalTime);

    const territory =
      createTerritory(route);

    try {
      // Keep local persistence.
      if (territory.captured) {
        await saveTerritory({
          id: `territory-${Date.now()}`,
          areaM2: territory.areaM2,
          areaKm2: territory.areaKm2,
          polygon: territory.polygon,
          activityType,
          capturedAt:
            new Date().toISOString(),
        });
      }

      // Save activity and GPS points remotely.
      const activityResponse =
        await saveActivityToBackend(
          finalTime,
          finalPace,
          territory,
        );

      // Territory creation is handled separately by
      // the server-authoritative PostGIS claim endpoint.
      if (
        territory.captured &&
        activityResponse?.activity?.id
      ) {
        await claimTerritoryOnBackend(
          activityResponse.activity.id,
          territory,
        );
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
        territory,
      });
    } catch (error) {
      console.error(
        'Failed to save activity:',
        error,
      );

      setIsSaving(false);

      Alert.alert(
        'Backend Save Failed',
        'The activity could not be saved to the server. Your local territory data is still preserved.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          showsUserLocation
          showsMyLocationButton
          userLocationPriority="high"
          userLocationUpdateInterval={3000}
          userLocationFastestInterval={2000}
          onUserLocationChange={
            handleLocationChange
          }
          initialRegion={{
            latitude: 28.6139,
            longitude: 77.209,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}>
          {route.length > 1 && (
            <Polyline
              coordinates={route}
              strokeWidth={5}
            />
          )}
        </MapView>

        <View
          style={styles.overlay}
          pointerEvents="box-none">

          {/* TOP STATUS */}

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {isSaving
                ? 'SAVING ACTIVITY...'
                : isTracking
                  ? isPaused
                    ? 'PAUSED'
                    : `${activityType.toUpperCase()} IN PROGRESS`
                  : 'START ACTIVITY'}
            </Text>
          </View>

          {/* STATS */}

          <View style={styles.statsCard}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {distance.toFixed(2)}
              </Text>

              <Text style={styles.statLabel}>
                KM
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {formatTime(
                  elapsedSeconds,
                )}
              </Text>

              <Text style={styles.statLabel}>
                TIME
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {calculatePace()}
              </Text>

              <Text style={styles.statLabel}>
                PACE / KM
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {route.length}
              </Text>

              <Text style={styles.statLabel}>
                GPS
              </Text>
            </View>
          </View>

          {/* ACTIVITY TYPE */}

          {!isTracking && (
            <View
              style={styles.typeContainer}>

              {(
                ['Run', 'Walk', 'Cycle'] as ActivityType[]
              ).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    activityType === type &&
                    styles.typeButtonActive,
                  ]}
                  onPress={() =>
                    setActivityType(type)
                  }>
                  <Text
                    style={[
                      styles.typeText,
                      activityType === type &&
                      styles.typeTextActive,
                    ]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* CONTROLS */}

          {/* CONTROLS */}

          <View style={styles.controls}>

            {!isTracking && (
              <>
                <TouchableOpacity
                  style={styles.planRouteButton}
                  onPress={() =>
                    navigation.navigate(
                      'RoutePlanner',
                    )
                  }>

                  <Text
                    style={
                      styles.planRouteText
                    }>
                    PLAN ROUTE
                  </Text>

                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.startButton}
                  onPress={
                    startActivity
                  }>

                  <Text
                    style={styles.buttonText}>
                    START{' '}
                    {activityType.toUpperCase()}
                  </Text>

                </TouchableOpacity>
              </>
            )}

            {isTracking &&
              !isPaused && (
                <View
                  style={styles.buttonRow}>

                  <TouchableOpacity
                    style={styles.pauseButton}
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
                    style={styles.finishButton}
                    onPress={
                      stopActivity
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
                  style={styles.buttonRow}>

                  <TouchableOpacity
                    style={styles.resumeButton}
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
                    style={styles.finishButton}
                    onPress={
                      stopActivity
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
    </SafeAreaView>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
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
    justifyContent: 'space-between',
  },

  statusBadge: {
    alignSelf: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
  },

  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#000',
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 15,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },

  statLabel: {
    color: '#777',
    fontSize: 8,
    marginTop: 4,
    fontWeight: '700',
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  typeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },

  typeButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },

  typeButtonActive: {
    backgroundColor: '#fff',
  },

  typeText: {
    color: '#aaa',
    fontWeight: '700',
  },

  typeTextActive: {
    color: '#000',
  },

  controls: {
    marginBottom: 5,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  startButton: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  pauseButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  resumeButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  finishButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: '#000',
    fontWeight: '900',
  },

  planRouteButton: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 10,
  },

  planRouteText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
});