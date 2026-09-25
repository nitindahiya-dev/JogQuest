import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import MapView, {
  PROVIDER_GOOGLE,
  Polygon,
  Polyline,
} from 'react-native-maps';

import {RouteProp, useRoute} from '@react-navigation/native';

import type {RootStackParamList} from '../../navigation/types';

type ActivityResultRouteProp = RouteProp<
  RootStackParamList,
  'ActivityResult'
>;

const ActivityResultScreen = () => {
  const route = useRoute<ActivityResultRouteProp>();

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

  const formattedTime = `${String(minutes).padStart(
    2,
    '0',
  )}:${String(seconds).padStart(2, '0')}`;

  const center =
    gpsRoute.length > 0
      ? gpsRoute[Math.floor(gpsRoute.length / 2)]
      : {
          latitude: 28.6139,
          longitude: 77.209,
        };

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
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
          />
        )}

        {territory.captured &&
          territory.polygon.length > 2 && (
            <Polygon
              coordinates={territory.polygon}
              strokeWidth={3}
              fillColor="rgba(255,255,255,0.25)"
            />
          )}
      </MapView>

      <View style={styles.sheet}>
        <Text style={styles.title}>
          Quest Complete
        </Text>

        <Text style={styles.subtitle}>
          {activityType} completed
        </Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.value}>
              {distance.toFixed(2)}
            </Text>
            <Text style={styles.label}>KM</Text>
          </View>

          <View style={styles.stat}>
            <Text style={styles.value}>
              {formattedTime}
            </Text>
            <Text style={styles.label}>TIME</Text>
          </View>

          <View style={styles.stat}>
            <Text style={styles.value}>
              {pace}
            </Text>
            <Text style={styles.label}>PACE</Text>
          </View>
        </View>

        {territory.captured ? (
          <View style={styles.territoryCard}>
            <Text style={styles.territoryTitle}>
              🏆 Territory Captured
            </Text>

            <Text style={styles.territoryArea}>
              {territory.areaKm2.toFixed(3)} km²
            </Text>

            <Text style={styles.territoryText}>
              Your route formed a closed loop.
            </Text>
          </View>
        ) : (
          <View style={styles.territoryCard}>
            <Text style={styles.territoryTitle}>
              No Territory Captured
            </Text>

            <Text style={styles.territoryText}>
              Complete a closed loop to capture territory.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default ActivityResultScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  map: {
    flex: 1,
  },

  sheet: {
    position: 'absolute',
    left: 15,
    right: 15,
    bottom: 15,
    backgroundColor: '#000',
    borderRadius: 24,
    padding: 20,
  },

  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },

  subtitle: {
    color: '#777',
    marginTop: 4,
  },

  stats: {
    flexDirection: 'row',
    marginTop: 20,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  value: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },

  label: {
    color: '#666',
    fontSize: 9,
    marginTop: 4,
  },

  territoryCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
  },

  territoryTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  territoryArea: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 8,
  },

  territoryText: {
    color: '#777',
    marginTop: 5,
  },
});