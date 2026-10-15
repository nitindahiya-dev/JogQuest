import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import AuthProvider, {useAuth} from '../auth/AuthContext';

// Screens
import MapScreen from '../screens/Map/MapScreen';
import ActivityScreen from '../screens/Activity/ActivityScreen';
import ActivityResultScreen from '../screens/Activity/ActivityResultScreen';
import LeaderboardScreen from '../screens/Leaderboard/LeaderboardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import SocialFeedScreen from '../screens/Social/SocialFeedScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import RoutePlannerScreen from '../screens/RoutePlanner/RoutePlannerScreen';
import TerritoryDetailsScreen from '../screens/Territory/TerritoryDetailsScreen';
import ActivityHistoryScreen from '../screens/History/ActivityHistoryScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';
import PublicProfileScreen from '../screens/Social/PublicProfileScreen';
import FollowListScreen from '../screens/Social/FollowListScreen';
import ClubsScreen from '../screens/Clubs/ClubsScreen';
import CreateClubScreen from '../screens/Clubs/CreateClubScreen';
import ClubDetailsScreen from '../screens/Clubs/ClubDetailsScreen';
import CompetitionsScreen from '../screens/Competitions/CompetitionsScreen';
import CreateCompetitionScreen from '../screens/Competitions/CreateCompetitionScreen';
import CompetitionDetailsScreen from '../screens/Competitions/CompetitionDetailsScreen';
import IntegrationsScreen from '../screens/Integrations/IntegrationsScreen';

import type {RootStackParamList, MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Design tokens ───
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.95)',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
};

// Custom Floating Tab Bar
const CustomTabBar = ({state, descriptors, navigation}: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBarContainer,
        {bottom: Math.max(insets.bottom, 12) + 8},
      ]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}>
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {label as string}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{tabBarLabel: 'MAP'}}
      />
      <Tab.Screen
        name="Feed"
        component={SocialFeedScreen}
        options={{tabBarLabel: 'FEED'}}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{tabBarLabel: 'START'}}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{tabBarLabel: 'RANKS'}}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{tabBarLabel: 'PROFILE'}}
      />
    </Tab.Navigator>
  );
};

const RootNavigator = () => {
  const {user, loading} = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: COLORS.background},
        headerTintColor: COLORS.text,
        headerTitleStyle: {fontWeight: '800', fontSize: 18},
        contentStyle: {backgroundColor: COLORS.background},
        headerShadowVisible: false,
      }}>
      {!user ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{headerShown: false}}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="ActivityHistory"
            component={ActivityHistoryScreen}
            options={{title: 'Activity History'}}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{title: 'Notifications'}}
          />
          <Stack.Screen
            name="PublicProfile"
            component={PublicProfileScreen}
            options={{title: 'Profile'}}
          />
          <Stack.Screen
            name="FollowList"
            component={FollowListScreen}
            options={({route}) => ({
              title:
                route.params.mode === 'followers' ? 'Followers' : 'Following',
            })}
          />
          <Stack.Screen
            name="Clubs"
            component={ClubsScreen}
            options={{title: 'Clubs'}}
          />
          <Stack.Screen
            name="CreateClub"
            component={CreateClubScreen}
            options={{title: 'Create Club'}}
          />
          <Stack.Screen
            name="ClubDetails"
            component={ClubDetailsScreen}
            options={{title: 'Club'}}
          />
          <Stack.Screen
            name="Competitions"
            component={CompetitionsScreen}
            options={{title: 'Competitions'}}
          />
          <Stack.Screen
            name="CreateCompetition"
            component={CreateCompetitionScreen}
            options={{title: 'Create Competition'}}
          />
          <Stack.Screen
            name="CompetitionDetails"
            component={CompetitionDetailsScreen}
            options={{title: 'Competition'}}
          />
          <Stack.Screen
            name="RoutePlanner"
            component={RoutePlannerScreen}
            options={{title: 'Route Planner'}}
          />
          <Stack.Screen
            name="Integrations"
            component={IntegrationsScreen}
            options={{title: 'Integrations'}}
          />
          <Stack.Screen
            name="ActivityResult"
            component={ActivityResultScreen}
            options={{title: 'Result'}}
          />
          <Stack.Screen
            name="TerritoryDetails"
            component={TerritoryDetailsScreen}
            options={{title: 'Territory'}}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
  );
};

export default AppNavigator;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 15,
  },

  // Floating tab bar
  tabBarContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 40,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 30,
  },
  tabItemActive: {
    backgroundColor: COLORS.accent,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: COLORS.textMuted,
  },
  tabLabelActive: {
    color: COLORS.background,
  },
});