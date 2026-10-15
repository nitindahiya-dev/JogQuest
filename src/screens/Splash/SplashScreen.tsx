import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS, TYPOGRAPHY, SHADOWS } from '../../theme';

const SplashScreen = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // 1. Scale and fade in the logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Pulse the neon glow behind the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim, scaleAnim, glowAnim]);

  return (
    <View style={styles.container}>
      {/* Animated Logo Block */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.logoText}>J</Text>
      </Animated.View>

      {/* Animated Glow Effect behind the logo */}
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowAnim, transform: [{ scale: scaleAnim }] },
        ]}
      />

      {/* Text Details */}
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        <Text style={styles.appName}>JOGQUEST</Text>
        <Text style={styles.tagline}>COMPETE. CAPTURE. CONQUER.</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  logoText: {
    color: COLORS.background,
    fontSize: 48,
    fontWeight: '900',
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.accent,
    zIndex: 1,
    ...SHADOWS.glow,
  },
  appName: {
    ...TYPOGRAPHY.hero,
    fontSize: 32,
    marginTop: 40,
    letterSpacing: 4,
    color: COLORS.text,
  },
  tagline: {
    ...TYPOGRAPHY.label,
    fontSize: 11,
    marginTop: 12,
    color: COLORS.accent,
    letterSpacing: 2,
  },
});

export default SplashScreen;