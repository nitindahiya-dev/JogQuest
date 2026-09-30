import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp =
  NativeStackNavigationProp<
    RootStackParamList,
    'Signup'
  >;

const API_BASE_URL = 'http://127.0.0.1:4000';

const SignupScreen = () => {
  const navigation =
    useNavigation<NavigationProp>();

  const { login } = useAuth();

  const [displayName, setDisplayName] =
    useState('');
  const [username, setUsername] =
    useState('');
  const [email, setEmail] =
    useState('');
  const [password, setPassword] =
    useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState('');

  const handleSignup = async () => {
    setError('');

    const cleanDisplayName =
      displayName.trim();
    const cleanUsername =
      username.trim();
    const cleanEmail =
      email.trim().toLowerCase();

    if (
      !cleanDisplayName ||
      !cleanUsername ||
      !cleanEmail ||
      !password ||
      !confirmPassword
    ) {
      setError(
        'Please fill in all fields.',
      );
      return;
    }

    if (password.length < 8) {
      setError(
        'Password must be at least 8 characters.',
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        'Passwords do not match.',
      );
      return;
    }

    try {
      setSubmitting(true);

      const response =
        await fetch(
          `${API_BASE_URL}/api/auth/signup`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              username: cleanUsername,
              displayName:
                cleanDisplayName,
              email: cleanEmail,
              password,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
          id?: string;
          username?: string;
          display_name?: string;
          email?: string | null;
          avatar_url?: string | null;
        };

      if (!response.ok || !data.id) {
        throw new Error(
          data.error ??
          'Signup failed.',
        );
      }

      // Automatically sign the new user in.
      await login(
        cleanEmail,
        password,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Signup failed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled">

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>
            J
          </Text>
        </View>

        <Text style={styles.title}>
          Create Account
        </Text>

        <Text style={styles.subtitle}>
          Join JogQuest and start
          capturing your territory.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>
            DISPLAY NAME
          </Text>

          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Full Name"
            placeholderTextColor="#555"
            autoCapitalize="words"
            style={styles.input}
          />

          <Text style={styles.label}>
            USERNAME
          </Text>

          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>
            EMAIL
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>
            PASSWORD
          </Text>

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            placeholderTextColor="#555"
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={styles.label}>
            CONFIRM PASSWORD
          </Text>

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat your password"
            placeholderTextColor="#555"
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          {error ? (
            <Text style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[
              styles.button,
              submitting &&
              styles.buttonDisabled,
            ]}
            onPress={handleSignup}
            disabled={submitting}>

            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>
                CREATE ACCOUNT
              </Text>
            )}
          </Pressable>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>
              Already have an account?
            </Text>

            <Pressable
              onPress={() =>
                navigation.navigate(
                  'Login',
                )
              }>
              <Text style={styles.loginLink}>
                SIGN IN
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  logoBox: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },

  logoText: {
    color: '#000',
    fontSize: 30,
    fontWeight: '900',
  },

  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },

  subtitle: {
    color: '#777',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 30,
  },

  form: {
    width: '100%',
  },

  label: {
    color: '#777',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 12,
  },

  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#292929',
    backgroundColor: '#111',
    color: '#fff',
    paddingHorizontal: 14,
    fontSize: 13,
  },

  error: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 14,
    lineHeight: 18,
  },

  button: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },

  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    gap: 6,
  },

  loginText: {
    color: '#666',
    fontSize: 12,
  },

  loginLink: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});

export default SignupScreen;
