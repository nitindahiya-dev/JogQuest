import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import MapScreen from '../screens/Map/MapScreen';
import ActivityScreen from '../screens/Activity/ActivityScreen';
import LeaderboardScreen from '../screens/Leaderboard/LeaderboardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#000',
            borderTopColor: '#222',
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#666',
        }}
      >
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;