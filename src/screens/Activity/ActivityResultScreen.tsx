import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import type {RootStackParamList} from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ActivityResultScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quest Complete</Text>
      <Text style={styles.subtitle}>
        Your activity has been recorded.
      </Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroValue}>8.42</Text>
        <Text style={styles.heroLabel}>KM COMPLETED</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.card}>
          <Text style={styles.value}>48:21</Text>
          <Text style={styles.label}>TIME</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>5:44</Text>
          <Text style={styles.label}>PACE</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>2.84</Text>
          <Text style={styles.label}>KM² CAPTURED</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.value}>+420</Text>
          <Text style={styles.label}>XP</Text>
        </View>
      </View>

      <View style={styles.captureCard}>
        <Text style={styles.captureTitle}>Territory captured</Text>

        <Text style={styles.captureText}>
          Your route created a new territory worth 2.84 km².
        </Text>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={() => navigation.navigate('TerritoryDetails')}>
          <Text style={styles.captureButtonText}>
            VIEW TERRITORY
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
    fontSize: 21,
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