import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

const TerritoryDetailsScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>TERRITORY MAP</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Delhi Territory</Text>
        <Text style={styles.subtitle}>Captured today</Text>

        <View style={styles.areaCard}>
          <Text style={styles.areaValue}>2.84 km²</Text>
          <Text style={styles.areaLabel}>TERRITORY AREA</Text>
        </View>

        <View style={styles.info}>
          <View>
            <Text style={styles.label}>OWNER</Text>
            <Text style={styles.value}>Nitin</Text>
          </View>

          <View>
            <Text style={styles.label}>STATUS</Text>
            <Text style={styles.value}>Protected</Text>
          </View>

          <View>
            <Text style={styles.label}>RANK</Text>
            <Text style={styles.value}>#31</Text>
          </View>
        </View>

        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Territory history</Text>

          <Text style={styles.historyText}>
            Captured by Nitin
          </Text>

          <Text style={styles.historyDate}>
            Today • 10:42 AM
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
  },

  mapPlaceholder: {
    height: 260,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapText: {
    color: '#444',
    fontSize: 18,
    fontWeight: '900',
  },

  content: {
    padding: 20,
  },

  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },

  subtitle: {
    color: '#777',
    marginTop: 5,
  },

  areaCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginTop: 22,
  },

  areaValue: {
    color: '#000',
    fontSize: 30,
    fontWeight: '900',
  },

  areaLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5,
  },

  info: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },

  label: {
    color: '#666',
    fontSize: 9,
    fontWeight: '800',
  },

  value: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 5,
  },

  historyCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 18,
    marginTop: 22,
  },

  historyTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  historyText: {
    color: '#aaa',
    marginTop: 12,
  },

  historyDate: {
    color: '#555',
    marginTop: 5,
  },
});