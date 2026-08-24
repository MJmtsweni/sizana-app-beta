import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors, fontFamily } from '../theme';

// Same navbar mark used in AppHeader — one logo asset, one source of truth.
const LOGO_MARK = require('../../assets/sizana-navbar-icon.png');

type AnimatedSplashProps = {
  onFinish: () => void;
  // Floors how long the animation stays up even if auth/session resolves
  // instantly — without this, a fast device could flash the logo for
  // 100ms and skip straight to the app, which reads as a glitch, not a brand moment.
  minDurationMs?: number;
};

export default function AnimatedSplash({ onFinish, minDurationMs = 1700 }: AnimatedSplashProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslateY = useRef(new Animated.Value(10)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo pops in — spring gives it a touch of life instead of a flat fade
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      // 2. Wordmark rises in underneath it
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkTranslateY, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      // 3. Tagline settles in last, quietest element
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onFinish, minDurationMs);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={LOGO_MARK}
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      />
      <Animated.Text
        style={[
          styles.wordmark,
          { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslateY }] },
        ]}
      >
        SIZANA
      </Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Helping each other
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 18,
  },
  wordmark: {
    fontSize: 30,
    fontFamily: fontFamily.extrabold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginTop: 6,
  },
});