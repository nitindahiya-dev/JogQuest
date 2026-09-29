import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  RouteProp,
  useRoute,
} from '@react-navigation/native';

import type {RootStackParamList} from '../../navigation/types';

type TerritoryDetailsRouteProp = RouteProp<
  RootStackParamList,
  'TerritoryDetails'
>;

const TerritoryDetailsScreen = () => {
  const route =
    useRoute<TerritoryDetailsRouteProp>();

  const {territory} = route.params;

  const capturedDate = new Date(
    territory.capturedAt,
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Territory
        </Text>

        <Text style={styles.subtitle}>
          {territory.activityType} capture
        </Text>
      </View>

      <View style={styles.areaCard}>
        <Text style={styles.areaValue}>
          {territory.areaKm2.toFixed(3)} km²
        </Text>

        <Text style={styles.areaLabel}>
          TERRITORY AREA
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.row}>
          <Text style={styles.label}>
            OWNER
          </Text>

          <Text style={styles.value}>
            You
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>
            ACTIVITY
          </Text>

          <Text style={styles.value}>
            {territory.activityType}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>
            STATUS
          </Text>

          <Text style={styles.value}>
            Protected
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>
            CAPTURED
          </Text>

          <Text style={styles.value}>
            {capturedDate.toLocaleString()}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>
            TERRITORY ID
          </Text>

          <Text style={styles.value}>
            {territory.id}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default TerritoryDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },

  header: {
    marginTop: 15,
  },

  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
  },

  subtitle: {
    color: '#777',
    marginTop: 5,
  },

  areaCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 30,
    alignItems: 'center',
    marginTop: 25,
  },

  areaValue: {
    color: '#000',
    fontSize: 36,
    fontWeight: '900',
  },

  areaLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5,
  },

  infoCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 18,
    marginTop: 20,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },

  label: {
    color: '#666',
    fontSize: 10,
    fontWeight: '800',
  },

  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
});