import React, {
  useCallback,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import MapView, {
  Polygon,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';

import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {
  getTerritories,
  StoredTerritory,
} from '../../utils/territoryStorage';

import type {
  RootStackParamList,
} from '../../navigation/types';

type NavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

type ApiTerritory = {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  area_m2: number;
  area_km2: number;
  polygon: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  captured_at: string;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const MapScreen = () => {
  const mapRef =
    useRef<MapView>(null);

  const navigation =
    useNavigation<NavigationProp>();

  const [territories, setTerritories] =
    useState<StoredTerritory[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [usingFallback, setUsingFallback] =
    useState(false);

  const convertApiTerritory = (
    territory: ApiTerritory,
  ): StoredTerritory => {
    const ring =
      territory.polygon.coordinates[0] ?? [];

    const polygon =
      ring.map(([longitude, latitude]) => ({
        latitude,
        longitude,
      }));

    return {
      id: territory.id,
      areaM2: Number(
        territory.area_m2,
      ),
      areaKm2: Number(
        territory.area_km2,
      ),
      polygon,
      activityType:
        territory.activity_type,
      capturedAt:
        territory.captured_at,
    };
  };

  const loadTerritories = useCallback(
    async () => {
      setLoading(true);
      setUsingFallback(false);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/territories`,
        );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as ApiTerritory[];

        const remoteTerritories =
          data.map(convertApiTerritory);

        setTerritories(
          remoteTerritories,
        );

        if (
          remoteTerritories.length > 0 &&
          remoteTerritories[0].polygon.length > 2
        ) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(
              remoteTerritories[0].polygon,
              {
                edgePadding: {
                  top: 100,
                  right: 60,
                  bottom: 100,
                  left: 60,
                },
                animated: true,
              },
            );
          }, 300);
        }
      } catch (error) {
        console.error(
          'Failed to load territories from API:',
          error,
        );

        // Keep local data available if the API
        // is temporarily unreachable.
        const localTerritories =
          await getTerritories();

        setTerritories(
          localTerritories,
        );

        setUsingFallback(true);

        if (
          localTerritories.length > 0
        ) {
          const latest =
            localTerritories[
              localTerritories.length - 1
            ];

          if (
            latest.polygon.length > 2
          ) {
            setTimeout(() => {
              mapRef.current?.fitToCoordinates(
                latest.polygon,
                {
                  edgePadding: {
                    top: 100,
                    right: 60,
                    bottom: 100,
                    left: 60,
                  },
                  animated: true,
                },
              );
            }, 300);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadTerritories();
    }, [loadTerritories]),
  );

  const openTerritory = (
    territory: StoredTerritory,
  ) => {
    navigation.navigate(
      'TerritoryDetails',
      {
        territoryId: territory.id,
      },
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: 28.6139,
          longitude: 77.209,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}>
        {territories.map(
          territory => (
            <Polygon
              key={territory.id}
              coordinates={
                territory.polygon
              }
              strokeWidth={5}
              strokeColor="#000000"
              fillColor="rgba(255,255,255,0.45)"
              tappable
              onPress={() =>
                openTerritory(
                  territory,
                )
              }
            />
          ),
        )}
      </MapView>

      {territories.length > 0 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {territories.length}{' '}
            {territories.length === 1
              ? 'TERRITORY'
              : 'TERRITORIES'}
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator
            color="#fff"
          />
        </View>
      )}

      {usingFallback && (
        <View style={styles.fallbackBadge}>
          <Text style={styles.fallbackText}>
            OFFLINE DATA
          </Text>
        </View>
      )}

      {territories.length === 0 &&
        !loading && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No Territory Yet
            </Text>

            <Text style={styles.emptyText}>
              Complete a closed route to
              capture your first territory.
            </Text>
          </View>
        )}
    </View>
  );
};

export default MapScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  counter: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    zIndex: 10,
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },

  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  loading: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 20,
  },

  fallbackBadge: {
    position: 'absolute',
    top: 65,
    alignSelf: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
  },

  fallbackText: {
    color: '#777',
    fontSize: 9,
    fontWeight: '900',
  },

  emptyCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 30,
    backgroundColor: '#000',
    borderRadius: 20,
    padding: 18,
  },

  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },

  emptyText: {
    color: '#777',
    marginTop: 6,
    lineHeight: 20,
  },
});
