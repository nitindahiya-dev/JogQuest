import React, {
  useState,
} from 'react';

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

import type { RootStackParamList } from '../../navigation/types';
import {
  useAuth,
} from '../../auth/AuthContext';

const LoginScreen =
  () => {
    const {
      login,
    } = useAuth();

    const [
      email,
      setEmail,
    ] = useState(
      '',
    );

    const [
      password,
      setPassword,
    ] = useState('');

    const [
      submitting,
      setSubmitting,
    ] = useState(false);

    const [
      error,
      setError,
    ] = useState<string | null>(
      null,
    );

    const handleLogin =
      async () => {
        if (
          !email.trim() ||
          !password
        ) {
          setError(
            'Please enter your email and password.',
          );

          return;
        }

        try {
          setSubmitting(true);
          setError(null);

          await login(
            email.trim().toLowerCase(),
            password,
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Login failed.',
          );
        } finally {
          setSubmitting(false);
        }
      };

    const navigation =
      useNavigation<NavigationProp>();
    type NavigationProp =
      NativeStackNavigationProp<
        RootStackParamList,
        'Login'
      >;

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">

          <View style={styles.logo}>
            <Text style={styles.logoText}>
              J
            </Text>
          </View>

          <Text style={styles.title}>
            Welcome Back
          </Text>

          <Text style={styles.subtitle}>
            Sign in to continue your JogQuest.
          </Text>

          <Text style={styles.label}>
            EMAIL
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
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
            placeholder="Password"
            placeholderTextColor="#555"
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.loginButton,
              submitting &&
              styles.disabledButton,
            ]}
            onPress={handleLogin}
            disabled={submitting}>

            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.loginButtonText}>
                SIGN IN
              </Text>
            )}
          </TouchableOpacity>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 22,
              gap: 6,
            }}>

            <Text
              style={{
                color: '#666',
                fontSize: 12,
              }}>
              Don't have an account?
            </Text>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Signup')
              }>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: '900',
                }}>
                CREATE ACCOUNT
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000',
    },

    content: {
      flexGrow: 1,
      justifyContent:
        'center',
      padding: 24,
    },

    logo: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor:
        '#fff',
      alignSelf:
        'center',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 22,
    },

    logoText: {
      color: '#000',
      fontSize: 28,
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
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 28,
    },

    label: {
      color: '#777',
      fontSize: 9,
      fontWeight: '900',
      marginBottom: 7,
      marginTop: 14,
    },

    input: {
      height: 52,
      backgroundColor:
        '#111',
      borderWidth: 1,
      borderColor:
        '#292929',
      borderRadius: 14,
      paddingHorizontal: 15,
      color: '#fff',
      fontSize: 13,
    },

    errorBox: {
      backgroundColor:
        '#171717',
      borderWidth: 1,
      borderColor:
        '#333',
      borderRadius: 12,
      padding: 12,
      marginTop: 16,
    },

    errorText: {
      color: '#aaa',
      fontSize: 11,
      lineHeight: 16,
    },

    loginButton: {
      height: 52,
      borderRadius: 14,
      backgroundColor:
        '#fff',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginTop: 22,
    },

    disabledButton: {
      opacity: 0.6,
    },

    loginButtonText: {
      color: '#000',
      fontSize: 11,
      fontWeight: '900',
    },
  });

export default LoginScreen;
