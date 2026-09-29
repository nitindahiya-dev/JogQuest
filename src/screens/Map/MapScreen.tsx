import React, {useCallback, useRef, useState} from 'react';
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

import type {RootStackParamList} from '../../navigation/types';

type NavigationProp =
  NativeStackNavigationProp<RootStackParamList>;

const MapScreen = () => {
  const mapRef = useRef<MapView>(null);

  const navigation = useNavigation<NavigationProp>();

  const [territories, setTerritories] =
    useState<StoredTerritory[]>([]);

  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);

        const stored = await getTerritories();

        if (!active) {
          return;
        }

        setTerritories(stored);
        setLoading(false);

        if (stored.length > 0) {
          const latestTerritory =
            stored[stored.length - 1];

          if (latestTerritory.polygon.length > 2) {
            setTimeout(() => {
              mapRef.current?.fitToCoordinates(
                latestTerritory.polygon,
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
      };

      load();

      return () => {
        active = false;
      };
    }, []),
  );

  const openTerritory = (
    territory: StoredTerritory,
  ) => {
    navigation.navigate('TerritoryDetails', {
      territory,
    });
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
        {territories.map(territory => (
          <Polygon
            key={territory.id}
            coordinates={territory.polygon}
            strokeWidth={5}
            strokeColor="#000000"
            fillColor="rgba(255,255,255,0.45)"
            tappable
            onPress={() =>
              openTerritory(territory)
            }
          />
        ))}
      </MapView>

      {territories.length > 0 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {territories.length} TERRITORY
            {territories.length > 1 ? 'IES' : ''}
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {territories.length === 0 && !loading && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No Territory Yet
          </Text>

          <Text style={styles.emptyText}>
            Complete a closed route to capture your
            first territory.
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