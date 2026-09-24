import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LeaderboardScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
    </View>
  );
};

export default LeaderboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
});