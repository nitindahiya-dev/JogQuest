import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  RouteProp,
  useRoute,
} from '@react-navigation/native';

import type {
  RootStackParamList,
} from '../../navigation/types';

type TerritoryDetailsRouteProp =
  RouteProp<
    RootStackParamList,
    'TerritoryDetails'
  >;

type TerritoryDetails = {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  area_m2: number;
  area_km2: number;
  captured_at: string;
  owner_username: string;
  owner_display_name: string;
  distance_km: number | null;
  elapsed_seconds: number | null;
  pace: string | null;
  latest_action: string | null;
  status: string;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const TerritoryDetailsScreen =
  () => {
    const route =
      useRoute<TerritoryDetailsRouteProp>();

    const {
      territoryId,
    } = route.params;

    const [territory, setTerritory] =
      useState<TerritoryDetails | null>(
        null,
      );

    const [loading, setLoading] =
      useState(true);

    const [error, setError] =
      useState<string | null>(null);

    const loadTerritory =
      useCallback(async () => {
        try {
          setLoading(true);
          setError(null);

          const response =
            await fetch(
              `${API_BASE_URL}/api/territories/${territoryId}`,
            );

          if (!response.ok) {
            throw new Error(
              `Server returned ${response.status}`,
            );
          }

          const data =
            (await response.json()) as TerritoryDetails;

          setTerritory(data);
        } catch (err) {
          console.error(
            'Failed to load territory:',
            err,
          );

          setError(
            'Could not load territory details.',
          );
        } finally {
          setLoading(false);
        }
      }, [territoryId]);

    useEffect(() => {
      loadTerritory();
    }, [loadTerritory]);

    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#fff"
          />

          <Text style={styles.loadingText}>
            Loading territory...
          </Text>
        </View>
      );
    }

    if (error || !territory) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error ??
              'Territory unavailable.'}
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadTerritory}>
            <Text style={styles.retryText}>
              RETRY
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const capturedDate =
      new Date(
        territory.captured_at,
      );

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Territory
          </Text>

          <Text style={styles.subtitle}>
            {territory.activity_type} capture
          </Text>
        </View>

        <View style={styles.areaCard}>
          <Text style={styles.areaValue}>
            {Number(
              territory.area_km2,
            ).toFixed(3)}{' '}
            km²
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
              {territory.owner_display_name}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              USERNAME
            </Text>

            <Text style={styles.value}>
              @{territory.owner_username}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              ACTIVITY
            </Text>

            <Text style={styles.value}>
              {territory.activity_type}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              STATUS
            </Text>

            <Text style={styles.value}>
              {territory.status}
            </Text>
          </View>

          {territory.distance_km !==
            null && (
            <View style={styles.row}>
              <Text style={styles.label}>
                DISTANCE
              </Text>

              <Text style={styles.value}>
                {Number(
                  territory.distance_km,
                ).toFixed(2)}{' '}
                km
              </Text>
            </View>
          )}

          {territory.pace && (
            <View style={styles.row}>
              <Text style={styles.label}>
                PACE
              </Text>

              <Text style={styles.value}>
                {territory.pace}
              </Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>
              CAPTURED
            </Text>

            <Text style={styles.value}>
              {capturedDate.toLocaleString()}
            </Text>
          </View>

          <View
            style={[
              styles.row,
              styles.lastRow,
            ]}>
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

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingText: {
    color: '#777',
    marginTop: 12,
  },

  errorText: {
    color: '#aaa',
    textAlign: 'center',
  },

  retryButton: {
    marginTop: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },

  retryText: {
    color: '#000',
    fontWeight: '900',
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

  lastRow: {
    borderBottomWidth: 0,
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
