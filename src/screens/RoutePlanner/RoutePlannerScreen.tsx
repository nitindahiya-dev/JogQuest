import React, {
  useState,
} from 'react';

import {
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
  RootStackParamList,
  Coordinate,
} from '../../navigation/types';

import {
  calculateDistance,
} from '../../utils/geo';

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'RoutePlanner'
  >;

type ActivityType =
  | 'Run'
  | 'Walk'
  | 'Cycle';

const PLANNED_ROUTE_KEY =
  '@jogquest/planned_route';

const RoutePlannerScreen = () => {
  const navigation =
    useNavigation<Navigation>();

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
    saving,
    setSaving,
  ] = useState(false);

  const distance = points.reduce(
    (total, point, index) => {
      if (index === 0) {
        return total;
      }

      return (
        total +
        calculateDistance(
          points[index - 1],
          point,
        )
      );
    },
    0,
  );

  const handleMapPress = (
    event: MapPressEvent,
  ) => {
    const coordinate =
      event.nativeEvent.coordinate;

    setPoints(current => [
      ...current,
      {
        latitude:
          coordinate.latitude,
        longitude:
          coordinate.longitude,
      },
    ]);
  };

  const undoLastPoint =
    () => {
      setPoints(current =>
        current.slice(
          0,
          -1,
        ),
      );
    };

  const clearRoute =
    () => {
      setPoints([]);
    };

  const closeRoute =
    () => {
      if (points.length < 2) {
        return;
      }

      const first =
        points[0];

      const last =
        points[points.length - 1];

      const closingDistance =
        calculateDistance(
          last,
          first,
        );

      if (
        closingDistance <= 0.05
      ) {
        return;
      }

      setPoints(current => [
        ...current,
        {
          latitude:
            first.latitude,
          longitude:
            first.longitude,
        },
      ]);
    };

  const saveRoute =
    async () => {
      if (points.length < 2) {
        Alert.alert(
          'Route too short',
          'Add at least two points to create a route.',
        );

        return;
      }

      try {
        setSaving(true);

        await AsyncStorage.setItem(
          PLANNED_ROUTE_KEY,
          JSON.stringify({
            activityType,
            route: points,
            distanceKm: distance,
            savedAt:
              new Date().toISOString(),
          }),
        );

        Alert.alert(
          'Route saved',
          `${distance.toFixed(
            2,
          )} km ${activityType.toLowerCase()} route saved.`,
          [
            {
              text: 'OK',
              onPress: () =>
                navigation.goBack(),
            },
          ],
        );
      } catch (error) {
        console.error(
          'Failed to save planned route:',
          error,
        );

        Alert.alert(
          'Error',
          'Could not save the planned route.',
        );
      } finally {
        setSaving(false);
      }
    };

  return (
    <SafeAreaView
      style={styles.container}>

      <View style={styles.mapContainer}>

        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          onPress={
            handleMapPress
          }
          initialRegion={{
            latitude: 28.6139,
            longitude: 77.209,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}>

          {points.map(
            (point, index) => (
              <Marker
                key={`${point.latitude}-${point.longitude}-${index}`}
                coordinate={{
                  latitude:
                    point.latitude,
                  longitude:
                    point.longitude,
                }}
                title={`Point ${
                  index + 1
                }`}
              />
            ),
          )}

          {points.length > 1 && (
            <Polyline
              coordinates={points}
              strokeWidth={5}
            />
          )}

        </MapView>

        <View
          style={styles.topCard}>

          <Text style={styles.title}>
            Plan Your Route
          </Text>

          <Text style={styles.subtitle}>
            Tap the map to add route points
          </Text>

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
            ))}

          </View>

        </View>

        <View
          style={
            styles.bottomPanel
          }>

          <View style={styles.statsCard}>

            <View style={styles.stat}>
              <Text
                style={
                  styles.statValue
                }>
                {distance.toFixed(2)}
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

            <View style={styles.stat}>
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
                POINTS
              </Text>
            </View>

          </View>

          <View
            style={
              styles.actionRow
            }>

            <TouchableOpacity
              style={styles.smallButton}
              onPress={
                undoLastPoint
              }
              disabled={
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
              style={styles.smallButton}
              onPress={
                closeRoute
              }
              disabled={
                points.length < 2
              }>

              <Text
                style={
                  styles.smallButtonText
                }>
                CLOSE
              </Text>

            </TouchableOpacity>

            <TouchableOpacity
              style={styles.smallButton}
              onPress={
                clearRoute
              }
              disabled={
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

          <TouchableOpacity
            style={[
              styles.saveButton,
              points.length < 2 &&
                styles.saveButtonDisabled,
            ]}
            onPress={saveRoute}
            disabled={
              saving ||
              points.length < 2
            }>

            <Text
              style={
                styles.saveButtonText
              }>
              {saving
                ? 'SAVING...'
                : 'SAVE ROUTE'}
            </Text>

          </TouchableOpacity>

        </View>

      </View>

    </SafeAreaView>
  );
};

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

  topCard: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    backgroundColor: '#000',
    borderRadius: 18,
    padding: 16,
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
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },

  typeButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  typeButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },

  typeText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '900',
  },

  typeTextActive: {
    color: '#000',
  },

  bottomPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#000',
    borderRadius: 18,
    paddingVertical: 16,
    marginBottom: 10,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },

  statLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 4,
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  smallButton: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  smallButtonText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },

  saveButton: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    backgroundColor: '#333',
  },

  saveButtonText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
});

export default RoutePlannerScreen;

