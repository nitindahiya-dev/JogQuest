import React, {useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform, StyleSheet} from 'react-native';
import MapView, {PROVIDER_GOOGLE, Region} from 'react-native-maps';

const MapScreen = () => {
  const mapRef = useRef<MapView>(null);
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    const requestLocationPermission = async () => {
      if (Platform.OS !== 'android') {
        setLocationGranted(true);
        return;
      }

      const fineLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );

      const coarseLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );

      setLocationGranted(
        fineLocation === PermissionsAndroid.RESULTS.GRANTED ||
          coarseLocation === PermissionsAndroid.RESULTS.GRANTED,
      );
    };

    requestLocationPermission();
  }, []);

  const handleUserLocationChange = (event: any) => {
    if (!locationGranted) {
      return;
    }

    const {latitude, longitude} = event.nativeEvent.coordinate;

    const region: Region = {
      latitude,
      longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    mapRef.current?.animateToRegion(region, 1000);
  };

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      showsUserLocation={locationGranted}
      showsMyLocationButton={locationGranted}
      initialRegion={{
        latitude: 28.6139,
        longitude: 77.209,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
      onUserLocationChange={handleUserLocationChange}
    />
  );
};

export default MapScreen;

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});