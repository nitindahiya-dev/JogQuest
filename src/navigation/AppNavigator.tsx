import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  BackHandler,
  Platform,
  ToastAndroid,
} from 'react-native';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import AuthProvider, {
  useAuth,
} from '../auth/AuthContext';

// Screens
import SplashScreen from '../screens/Splash/SplashScreen';
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
import MessagesScreen from '../screens/Messages/MessagesScreen';
import ChatScreen from '../screens/Messages/ChatScreen';
import PublicProfileScreen from '../screens/Social/PublicProfileScreen';
import FollowListScreen from '../screens/Social/FollowListScreen';
import ClubsScreen from '../screens/Clubs/ClubsScreen';
import CreateClubScreen from '../screens/Clubs/CreateClubScreen';
import ClubDetailsScreen from '../screens/Clubs/ClubDetailsScreen';
import CompetitionsScreen from '../screens/Competitions/CompetitionsScreen';
import CreateCompetitionScreen from '../screens/Competitions/CreateCompetitionScreen';
import CompetitionDetailsScreen from '../screens/Competitions/CompetitionDetailsScreen';
import IntegrationsScreen from '../screens/Integrations/IntegrationsScreen';
import ProfileDetailsScreen from '../screens/Profile/ProfileDetailsScreen';
import ForgotPasswordScreen from '../screens/Auth/ForgotPasswordScreen';

import type {
  RootStackParamList,
  MainTabParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Design tokens
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.95)',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
};

// Custom Floating Tab Bar with Sliding Bubble
const CustomTabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  // Animated value for the current active tab index
  const animatedIndex = useRef(new Animated.Value(state.index)).current;

  // Store the measured layout (x position + width) of each tab
  const [tabLayouts, setTabLayouts] = useState<
    { x: number; width: number }[]
  >([]);

  // Animate the pill whenever the active tab changes
  useEffect(() => {
    Animated.spring(animatedIndex, {
      toValue: state.index,
      useNativeDriver: false, // Required because we animate width
      tension: 90,
      friction: 11,
    }).start();
  }, [state.index, animatedIndex]);

  // Interpolate translateX and width from the measured layouts
  const pillTranslateX =
    tabLayouts.length === state.routes.length
      ? animatedIndex.interpolate({
        inputRange: state.routes.map((_, i) => i),
        outputRange: tabLayouts.map(l => l.x),
        extrapolate: 'clamp',
      })
      : 0;

  const pillWidth =
    tabLayouts.length === state.routes.length
      ? animatedIndex.interpolate({
        inputRange: state.routes.map((_, i) => i),
        outputRange: tabLayouts.map(l => l.width),
        extrapolate: 'clamp',
      })
      : 0;

  return (
    <View
      style={[
        styles.tabBarContainer,
        { bottom: Math.max(insets.bottom, 12) + 8 },
      ]}>
      <View style={styles.tabBar}>
        {/* ─── Sliding Bubble Pill ─── */}
        {tabLayouts.length === state.routes.length && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingPill,
              {
                width: pillWidth,
                transform: [{ translateX: pillTranslateX }],
              },
            ]}
          />
        )}

        {/* ─── Tab Items ─── */}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
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
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={String(label)}
              onLayout={event => {
                const { x, width } = event.nativeEvent.layout;
                setTabLayouts(prev => {
                  const next = [...prev];
                  next[index] = { x, width };
                  return next;
                });
              }}
              style={styles.tabItem}>
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelActive,
                ]}>
                {label as string}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

// Main bottom tabs
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
        options={{ tabBarLabel: 'MAP' }}
      />

      <Tab.Screen
        name="Feed"
        component={SocialFeedScreen}
        options={{ tabBarLabel: 'FEED' }}
      />

      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{ tabBarLabel: 'START' }}
      />

      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ tabBarLabel: 'RANKS' }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'PROFILE' }}
      />
    </Tab.Navigator>
  );
};

// Root navigator
const RootNavigator = () => {
  const { user, loading } = useAuth();

  // Keep the splash visible for at least 2.5 seconds.
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Wait for both authentication initialization and the
  // minimum splash-screen duration.
  if (loading || showSplash) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
        },
        contentStyle: {
          backgroundColor: COLORS.background,
        },
        headerShadowVisible: false,
      }}>
      {!user ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="ActivityHistory"
            component={ActivityHistoryScreen}
            options={{ title: 'Activity History' }}
          />

          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: 'Notifications' }}
          />
          <Stack.Screen
            name="Messages"
            component={MessagesScreen}
            options={{ title: 'Messages' }}
          />

          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }) => ({
              title: route.params.otherDisplayName || route.params.otherUsername || 'Chat',
            })}
          />

          <Stack.Screen
            name="PublicProfile"
            component={PublicProfileScreen}
            options={{ title: 'Profile' }}
          />

          <Stack.Screen
            name="FollowList"
            component={FollowListScreen}
            options={({ route }) => ({
              title:
                route.params.mode === 'followers'
                  ? 'Followers'
                  : 'Following',
            })}
          />

          <Stack.Screen
            name="Clubs"
            component={ClubsScreen}
            options={{ title: 'Clubs' }}
          />

          <Stack.Screen
            name="CreateClub"
            component={CreateClubScreen}
            options={{ title: 'Create Club' }}
          />

          <Stack.Screen
            name="ClubDetails"
            component={ClubDetailsScreen}
            options={{ title: 'Club' }}
          />

          <Stack.Screen
            name="Competitions"
            component={CompetitionsScreen}
            options={{ title: 'Competitions' }}
          />

          <Stack.Screen
            name="CreateCompetition"
            component={CreateCompetitionScreen}
            options={{ title: 'Create Competition' }}
          />

          <Stack.Screen
            name="CompetitionDetails"
            component={CompetitionDetailsScreen}
            options={{ title: 'Competition' }}
          />

          <Stack.Screen
            name="RoutePlanner"
            component={RoutePlannerScreen}
            options={{
              title: 'Route Planner',
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="Integrations"
            component={IntegrationsScreen}
            options={{ title: 'Integrations' }}
          />

          <Stack.Screen
            name="ProfileDetails"
            component={ProfileDetailsScreen}
            options={{ title: 'Personal Details' }}
          />

          <Stack.Screen
            name="ActivityResult"
            component={ActivityResultScreen}
            options={{
              title: 'Result',
              headerShown: false,
            }}
          />

          <Stack.Screen
            name="TerritoryDetails"
            component={TerritoryDetailsScreen}
            options={{ title: 'Territory' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

// App navigator
const AppNavigator = () => {
  const lastBackPress = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const now = Date.now();

        if (now - lastBackPress.current < 2000) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPress.current = now;
        ToastAndroid.show(
          'Press back again to exit',
          ToastAndroid.SHORT,
        );
        return true;
      },
    );

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default AppNavigator;

// Styles
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

  // Floating tab bar container
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
    position: 'relative', // Needed to position the absolute sliding pill behind items
  },

  // Sliding Bubble Pill style
  slidingPill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 30,
    zIndex: 0,
  },

  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 30,
    zIndex: 1, // Ensure text stays cleanly on top of the sliding pill
    alignItems: 'center',
    justifyContent: 'center',
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