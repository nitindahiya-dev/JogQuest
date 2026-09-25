import React, {useState} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type ActivityType = 'Run' | 'Walk' | 'Cycle';

const ActivityScreen = () => {
  const [activityType, setActivityType] =
    useState<ActivityType>('Run');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Start Activity</Text>
        <Text style={styles.subtitle}>
          Turn your route into territory.
        </Text>

        <View style={styles.typeContainer}>
          {(['Run', 'Walk', 'Cycle'] as ActivityType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeButton,
                activityType === type && styles.typeButtonActive,
              ]}
              onPress={() => setActivityType(type)}>
              <Text
                style={[
                  styles.typeText,
                  activityType === type && styles.typeTextActive,
                ]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>0.00</Text>
            <Text style={styles.statLabel}>KM</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>00:00</Text>
            <Text style={styles.statLabel}>TIME</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stat}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>AREA</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Ready for your quest?</Text>

          <Text style={styles.infoText}>
            Start moving and JogQuest will record your route.
          </Text>
        </View>

        <TouchableOpacity style={styles.startButton}>
          <Text style={styles.startButtonText}>
            START {activityType.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  content: {
    flex: 1,
    padding: 20,
  },

  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 10,
  },

  subtitle: {
    color: '#777',
    fontSize: 15,
    marginTop: 6,
  },

  typeContainer: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 10,
  },

  typeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292929',
    alignItems: 'center',
  },

  typeButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },

  typeText: {
    color: '#777',
    fontWeight: '700',
  },

  typeTextActive: {
    color: '#000',
  },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 28,
    marginTop: 25,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '800',
  },

  statLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },

  divider: {
    width: 1,
    height: 35,
    backgroundColor: '#292929',
  },

  infoCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
  },

  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  infoText: {
    color: '#777',
    marginTop: 8,
    lineHeight: 21,
  },

  startButton: {
    marginTop: 'auto',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },

  startButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },
});