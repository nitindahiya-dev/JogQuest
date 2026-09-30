import React from 'react';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import MapScreen from '../screens/Map/MapScreen';
import ActivityScreen from '../screens/Activity/ActivityScreen';
import ActivityResultScreen from '../screens/Activity/ActivityResultScreen';
import LeaderboardScreen from '../screens/Leaderboard/LeaderboardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import TerritoryDetailsScreen from '../screens/Territory/TerritoryDetailsScreen';
import ActivityHistoryScreen from '../screens/History/ActivityHistoryScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';
import SocialFeedScreen from '../screens/Social/SocialFeedScreen';
import PublicProfileScreen from '../screens/Social/PublicProfileScreen';
import FollowListScreen from '../screens/Social/FollowListScreen';

import type {
  RootStackParamList,
  MainTabParamList,
} from './types';

const Tab =
  createBottomTabNavigator<MainTabParamList>();

const Stack =
  createNativeStackNavigator<RootStackParamList>();

const TabIcon = ({
  symbol,
  focused,
  color,
}: {
  symbol: string;
  focused: boolean;
  color: string;
}) => {
  return (
    <View
      style={[
        styles.iconContainer,
        focused &&
          styles.iconContainerActive,
      ]}>

      <Text
        style={[
          styles.icon,
          {
            color: focused
              ? '#000'
              : color,
          },
        ]}>
        {symbol}
      </Text>

    </View>
  );
};

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,

        tabBarStyle: {
          height: 68,
          width: '100%',
          backgroundColor: '#050505',
          borderTopWidth: 1,
          borderTopColor: '#222',
          paddingTop: 6,
          paddingBottom: 7,
          paddingHorizontal: 0,
        },

        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#666',

        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '700',
          marginTop: 2,
        },

        tabBarItemStyle: {
          width: '20%',
        },
      }}>

      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              symbol="M"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Feed"
        component={SocialFeedScreen}
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              symbol="F"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          tabBarLabel: 'Activity',
          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              symbol="A"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          tabBarLabel: 'Ranks',
          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              symbol="R"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <TabIcon
              symbol="P"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

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
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="ActivityHistory"
          component={ActivityHistoryScreen}
          options={{
            title: 'Activity History',
          }}
        />

        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            title: 'Notifications',
          }}
        />

        <Stack.Screen
          name="PublicProfile"
          component={PublicProfileScreen}
          options={{
            title: 'Profile',
          }}
        />

        <Stack.Screen
          name="FollowList"
          component={FollowListScreen}
          options={({ route }) => ({
            title:
              route.params.mode ===
              'followers'
                ? 'Followers'
                : 'Following',
          })}
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
          component={
            TerritoryDetailsScreen
          }
          options={{
            title: 'Territory',
          }}
        />

      </Stack.Navigator>

    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#292929',
  },

  iconContainerActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },

  icon: {
    fontSize: 11,
    fontWeight: '900',
  },
});

export default AppNavigator;