import React from 'react';
import AuthProvider, { useAuth } from '../auth/AuthContext';
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
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  ActivityIndicator,
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
import ClubsScreen from '../screens/Clubs/ClubsScreen';
import CreateClubScreen from '../screens/Clubs/CreateClubScreen';
import ClubDetailsScreen from '../screens/Clubs/ClubDetailsScreen';
import CompetitionsScreen from '../screens/Competitions/CompetitionsScreen';
import CreateCompetitionScreen from '../screens/Competitions/CreateCompetitionScreen';
import CompetitionDetailsScreen from '../screens/Competitions/CompetitionDetailsScreen';
import IntegrationsScreen from '../screens/Integrations/IntegrationsScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';

import type {
  RootStackParamList,
  MainTabParamList,
} from './types';
import RoutePlannerScreen from '../screens/RoutePlanner/RoutePlannerScreen';

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
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}>

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

    </SafeAreaView>
  );
};

const RootNavigator = () => {
  const {
    user,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator
          size="small"
          color="#fff"
        />

        <Text
          style={{
            color: '#777',
            marginTop: 10,
            fontSize: 11,
          }}>
          Restoring session...
        </Text>
      </View>
    );
  }

  return (
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

      {!user ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{
              headerShown: false,
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="MainTabs"
            component={
              MainTabs
            }
            options={{
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="ActivityHistory"
            component={
              ActivityHistoryScreen
            }
            options={{
              title:
                'Activity History',
            }}
          />

          <Stack.Screen
            name="Notifications"
            component={
              NotificationsScreen
            }
            options={{
              title:
                'Notifications',
            }}
          />

          <Stack.Screen
            name="PublicProfile"
            component={
              PublicProfileScreen
            }
            options={{
              title: 'Profile',
            }}
          />

          <Stack.Screen
            name="FollowList"
            component={
              FollowListScreen
            }
            options={({ route }) => ({
              title:
                route.params.mode ===
                  'followers'
                  ? 'Followers'
                  : 'Following',
            })}
          />

          <Stack.Screen
            name="Clubs"
            component={
              ClubsScreen
            }
            options={{
              title: 'Clubs',
            }}
          />

          <Stack.Screen
            name="CreateClub"
            component={
              CreateClubScreen
            }
            options={{
              title:
                'Create Club',
            }}
          />

          <Stack.Screen
            name="ClubDetails"
            component={
              ClubDetailsScreen
            }
            options={{
              title: 'Club',
            }}
          />

          <Stack.Screen
            name="Competitions"
            component={
              CompetitionsScreen
            }
            options={{
              title:
                'Competitions',
            }}
          />

          <Stack.Screen
            name="CreateCompetition"
            component={
              CreateCompetitionScreen
            }
            options={{
              title:
                'Create Competition',
            }}
          />

          <Stack.Screen
            name="CompetitionDetails"
            component={
              CompetitionDetailsScreen
            }
            options={{
              title:
                'Competition',
            }}
          />

          <Stack.Screen
            name="RoutePlanner"
            component={
              RoutePlannerScreen
            }
            options={{
              title:
                'Route Planner',
            }}
          />

          <Stack.Screen
            name="Integrations"
            component={
              IntegrationsScreen
            }
            options={{
              title:
                'Integrations',
            }}
          />

          <Stack.Screen
            name="ActivityResult"
            component={
              ActivityResultScreen
            }
            options={{
              title:
                'Activity Result',
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
        </>
      )}

    </Stack.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },

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