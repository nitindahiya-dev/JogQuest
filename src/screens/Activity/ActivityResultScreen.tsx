import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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
  } = route.params;

  const minutes = Math.floor(elapsedSeconds / 60);

  const seconds = elapsedSeconds % 60;

  const formattedTime = `${String(minutes).padStart(
    2,
    '0',
  )}:${String(seconds).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quest Complete</Text>

      <Text style={styles.subtitle}>
        Your {activityType.toLowerCase()} has been recorded.
      </Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroValue}>
          {distance.toFixed(2)}
        </Text>

        <Text style={styles.heroLabel}>
          KM COMPLETED
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.card}>
          <Text style={styles.value}>
            {formattedTime}
          </Text>

          <Text style={styles.label}>TIME</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>
            {pace}
          </Text>

          <Text style={styles.label}>PACE / KM</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>
            {gpsRoute.length}
          </Text>

          <Text style={styles.label}>GPS POINTS</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>
            {activityType}
          </Text>

          <Text style={styles.label}>ACTIVITY</Text>
        </View>
      </View>

      <View style={styles.captureCard}>
        <Text style={styles.captureTitle}>
          Route recorded
        </Text>

        <Text style={styles.captureText}>
          JogQuest recorded {gpsRoute.length} GPS points
          across {distance.toFixed(2)} km.
        </Text>

        <TouchableOpacity
          style={styles.captureButton}>
          <Text style={styles.captureButtonText}>
            CONTINUE
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ActivityResultScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },

  title: {
    color: '#fff',
    fontSize: 31,
    fontWeight: '900',
    marginTop: 15,
  },

  subtitle: {
    color: '#777',
    marginTop: 5,
  },

  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 30,
    marginTop: 25,
  },

  heroValue: {
    color: '#000',
    fontSize: 50,
    fontWeight: '900',
  },

  heroLabel: {
    color: '#777',
    fontWeight: '800',
    fontSize: 11,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 15,
  },

  card: {
    width: '48%',
    backgroundColor: '#111',
    borderRadius: 18,
    paddingVertical: 20,
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
    fontWeight: '800',
    marginTop: 6,
  },

  captureCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 20,
    marginTop: 15,
  },

  captureTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
  },

  captureText: {
    color: '#777',
    marginTop: 8,
    lineHeight: 21,
  },

  captureButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },

  captureButtonText: {
    color: '#000',
    fontWeight: '900',
  },
});