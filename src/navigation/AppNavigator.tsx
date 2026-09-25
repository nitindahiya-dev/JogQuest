import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import MapScreen from '../screens/Map/MapScreen';
import ActivityScreen from '../screens/Activity/ActivityScreen';
import ActivityResultScreen from '../screens/Activity/ActivityResultScreen';
import LeaderboardScreen from '../screens/Leaderboard/LeaderboardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import TerritoryDetailsScreen from '../screens/Territory/TerritoryDetailsScreen';

import type {RootStackParamList} from './types';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#222',
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#666',
      }}>
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#000',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '700',
          },
          contentStyle: {
            backgroundColor: '#000',
          },
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="ActivityResult"
          component={ActivityResultScreen}
          options={{
            title: 'Activity Result',
          }}
        />

        <Stack.Screen
          name="TerritoryDetails"
          component={TerritoryDetailsScreen}
          options={{
            title: 'Territory',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;