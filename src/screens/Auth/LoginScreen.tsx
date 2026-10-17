import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const LoginScreen = () => {
  const { login } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>J</Text>
        </View>

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          Sign in to continue your JogQuest.
        </Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            style={styles.input}
          />
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          onPress={handleForgotPassword}
          disabled={submitting}
          style={{ alignSelf: 'flex-end', marginBottom: 12 }}
        >
          <Text style={styles.signupLink}>FORGOT PASSWORD?</Text>
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.loginButton,
            submitting && styles.disabledButton,
          ]}
          onPress={handleLogin}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <Text style={styles.loginButtonText}>SIGN IN</Text>
          )}
        </TouchableOpacity>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>
            Don't have an account?
          </Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('Signup')}
            disabled={submitting}
            activeOpacity={0.7}
          >
            <Text style={styles.signupLink}>CREATE ACCOUNT</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },

  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.glow,
  },

  logoText: {
    color: COLORS.background,
    fontSize: 40,
    fontWeight: '900',
  },

  title: {
    ...TYPOGRAPHY.hero,
    textAlign: 'center',
  },

  subtitle: {
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },

  inputWrapper: {
    marginBottom: SPACING.md,
  },

  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.xs,
  },

  input: {
    height: 56,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
  },

  errorBox: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 12,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
  },

  loginButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.glow,
  },

  disabledButton: {
    opacity: 0.6,
  },

  loginButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontSize: 14,
  },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: 6,
    flexWrap: 'wrap',
  },

  signupText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
  },

  signupLink: {
    ...TYPOGRAPHY.label,
    color: COLORS.accent,
    fontSize: 11,
  },
});

export default LoginScreen;