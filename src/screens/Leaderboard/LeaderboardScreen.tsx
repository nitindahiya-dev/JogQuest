import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const players = [
  {id: '1', rank: 1, name: 'Arjun', area: '124.8 km²'},
  {id: '2', rank: 2, name: 'Rahul', area: '108.4 km²'},
  {id: '3', rank: 3, name: 'Nitin', area: '96.7 km²'},
  {id: '4', rank: 4, name: 'Aman', area: '91.2 km²'},
  {id: '5', rank: 5, name: 'Vikram', area: '84.5 km²'},
];

const LeaderboardScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>Compete. Capture. Conquer.</Text>

      <View style={styles.filters}>
        <View style={styles.filterActive}>
          <Text style={styles.filterActiveText}>Global</Text>
        </View>

        <View style={styles.filter}>
          <Text style={styles.filterText}>City</Text>
        </View>

        <View style={styles.filter}>
          <Text style={styles.filterText}>Friends</Text>
        </View>
      </View>

      <FlatList
        data={players}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <View style={styles.playerCard}>
            <View style={styles.rankBox}>
              <Text style={styles.rank}>#{item.rank}</Text>
            </View>

            <View style={styles.playerInfo}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.area}>{item.area} territory</Text>
            </View>

            <Text style={styles.quest}>QUEST</Text>
          </View>
        )}
      />

      <View style={styles.yourRankCard}>
        <Text style={styles.yourRankLabel}>YOUR RANK</Text>
        <View style={styles.yourRankRow}>
          <Text style={styles.yourRank}>#31</Text>
          <Text style={styles.yourArea}>24.8 km²</Text>
        </View>
      </View>
    </View>
  );
};

export default LeaderboardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },

  subtitle: {
    color: '#777',
    fontSize: 15,
    marginTop: 5,
  },

  filters: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },

  filter: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292929',
  },

  filterActive: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#fff',
  },

  filterText: {
    color: '#777',
    fontWeight: '700',
  },

  filterActiveText: {
    color: '#000',
    fontWeight: '700',
  },

  list: {
    paddingTop: 20,
    paddingBottom: 130,
  },

  playerCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rankBox: {
    width: 48,
  },

  rank: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  playerInfo: {
    flex: 1,
  },

  name: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  area: {
    color: '#777',
    marginTop: 4,
  },

  quest: {
    color: '#555',
    fontSize: 10,
    fontWeight: '800',
  },

  yourRankCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 15,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
  },

  yourRankLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
  },

  yourRankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },

  yourRank: {
    color: '#000',
    fontSize: 24,
    fontWeight: '900',
  },

  yourArea: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});