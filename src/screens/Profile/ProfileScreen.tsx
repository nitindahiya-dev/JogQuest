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

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>N</Text>
        </View>

        <Text style={styles.name}>Nitin</Text>
        <Text style={styles.username}>@nitin</Text>

        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>LEVEL 12</Text>
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.value}>24.8</Text>
          <Text style={styles.label}>TERRITORY KM²</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>127</Text>
          <Text style={styles.label}>ACTIVITIES</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.stat}>
          <Text style={styles.value}>31</Text>
          <Text style={styles.label}>RANK</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quest Stats</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Distance</Text>
          <Text style={styles.rowValue}>842.6 km</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Territories Captured</Text>
          <Text style={styles.rowValue}>86</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Territories Defended</Text>
          <Text style={styles.rowValue}>41</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.activityButton}
        onPress={() => navigation.navigate('ActivityResult')}>
        <Text style={styles.activityButtonText}>
          VIEW LATEST ACTIVITY
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },

  profileHeader: {
    alignItems: 'center',
    marginTop: 15,
  },

  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 34,
    fontWeight: '900',
  },

  name: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 12,
  },

  username: {
    color: '#666',
    marginTop: 3,
  },

  levelBadge: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111',
    borderRadius: 10,
  },

  levelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 20,
    marginTop: 25,
    paddingVertical: 22,
  },

  stat: {
    flex: 1,
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
    marginTop: 5,
    textAlign: 'center',
  },

  divider: {
    width: 1,
    backgroundColor: '#292929',
  },

  section: {
    marginTop: 25,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 12,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },

  rowLabel: {
    color: '#777',
  },

  rowValue: {
    color: '#fff',
    fontWeight: '700',
  },

  activityButton: {
    marginTop: 'auto',
    backgroundColor: '#fff',
    paddingVertical: 17,
    borderRadius: 18,
    alignItems: 'center',
  },

  activityButtonText: {
    color: '#000',
    fontWeight: '900',
  },
});