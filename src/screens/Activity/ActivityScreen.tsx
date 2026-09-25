import React, {useEffect, useRef, useState} from 'react';
import {
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import MapView, {
  PROVIDER_GOOGLE,
  Polyline,
} from 'react-native-maps';

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import type {RootStackParamList} from '../../navigation/types';
import {
  calculateDistance,
  Coordinate,
  formatTime,
} from '../../utils/geo';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ActivityType = 'Run' | 'Walk' | 'Cycle';

const ActivityScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const mapRef = useRef<MapView>(null);

  const [activityType, setActivityType] =
    useState<ActivityType>('Run');

  const [isTracking, setIsTracking] = useState(false);

  const [route, setRoute] = useState<Coordinate[]>([]);

  const [distance, setDistance] = useState(0);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimeRef = useRef<number | null>(null);

  const lastLocationRef = useRef<Coordinate | null>(null);

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

  useEffect(() => {
    if (!isTracking) {
      return;
    }

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor(
          (Date.now() - startTimeRef.current) / 1000,
        );

        setElapsedSeconds(elapsed);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isTracking]);

  const handleLocationChange = (event: any) => {
    if (!isTracking) {
      return;
    }

    const coordinate: Coordinate =
      event.nativeEvent.coordinate;

    if (!coordinate) {
      return;
    }

    const lastLocation = lastLocationRef.current;

    if (lastLocation) {
      const segmentDistance = calculateDistance(
        lastLocation,
        coordinate,
      );

      // Ignore extremely small/noisy GPS jumps.
      if (segmentDistance < 0.003) {
        return;
      }

      setDistance(current => current + segmentDistance);
    }

    lastLocationRef.current = coordinate;

    setRoute(current => [...current, coordinate]);
  };

  const startActivity = () => {
    setRoute([]);
    setDistance(0);
    setElapsedSeconds(0);

    lastLocationRef.current = null;

    startTimeRef.current = Date.now();

    setIsTracking(true);
  };

  const stopActivity = () => {
    setIsTracking(false);

    const finalTime = startTimeRef.current
      ? Math.floor(
          (Date.now() - startTimeRef.current) / 1000,
        )
      : 0;

    setElapsedSeconds(finalTime);

    startTimeRef.current = null;

    lastLocationRef.current = null;

    navigation.navigate('ActivityResult');
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
          followsUserLocation
          onUserLocationChange={handleLocationChange}
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

        <View style={styles.overlay}>
          <Text style={styles.activityTitle}>
            {isTracking
              ? `${activityType} in progress`
              : 'Start Activity'}
          </Text>

          <View style={styles.statsCard}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {distance.toFixed(2)}
              </Text>

              <Text style={styles.statLabel}>KM</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {formatTime(elapsedSeconds)}
              </Text>

              <Text style={styles.statLabel}>TIME</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {route.length}
              </Text>

              <Text style={styles.statLabel}>GPS POINTS</Text>
            </View>
          </View>

          {!isTracking && (
            <View style={styles.typeContainer}>
              {(['Run', 'Walk', 'Cycle'] as ActivityType[]).map(
                type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      activityType === type &&
                        styles.typeButtonActive,
                    ]}
                    onPress={() => setActivityType(type)}>
                    <Text
                      style={[
                        styles.typeText,
                        activityType === type &&
                          styles.typeTextActive,
                      ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.startButton,
              isTracking && styles.stopButton,
            ]}
            onPress={
              isTracking ? stopActivity : startActivity
            }>
            <Text style={styles.startButtonText}>
              {isTracking
                ? 'FINISH ACTIVITY'
                : `START ${activityType.toUpperCase()}`}
            </Text>
          </TouchableOpacity>
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
    pointerEvents: 'box-none',
  },

  activityTitle: {
    color: '#fff',
    backgroundColor: '#000',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    overflow: 'hidden',
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
    fontSize: 20,
    fontWeight: '800',
  },

  statLabel: {
    color: '#777',
    fontSize: 9,
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

  startButton: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },

  stopButton: {
    backgroundColor: '#fff',
  },

  startButtonText: {
    color: '#000',
    fontWeight: '900',
  },
});