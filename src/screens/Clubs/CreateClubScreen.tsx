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

import {
  useNavigation,
} from '@react-navigation/native';

import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';

import type {
  RootStackParamList,
} from '../../navigation/types';

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    'CreateClub'
  >;

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const CreateClubScreen = () => {
  const navigation =
    useNavigation<Navigation>();

  const [
    name,
    setName,
  ] = useState('');

  const [
    description,
    setDescription,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const createClub =
    async () => {
      const cleanName =
        name.trim();

      const cleanDescription =
        description.trim();

      if (!cleanName) {
        setError(
          'Club name is required.',
        );
        return;
      }

      if (loading) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/clubs`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                userId:
                  DEV_USER_ID,

                name: cleanName,

                description:
                  cleanDescription,
              }),
            },
          );

        const data =
          (await response.json()) as {
            id?: string;
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Failed to create club',
          );
        }

        if (!data.id) {
          throw new Error(
            'Club was created but no ID was returned.',
          );
        }

        navigation.replace(
          'ClubDetails',
          {
            clubId: data.id,
          },
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to create club',
        );
      } finally {
        setLoading(false);
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

        <Text style={styles.title}>
          Create a Club
        </Text>

        <Text style={styles.subtitle}>
          Build a community around your
          running goals.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        <Text style={styles.label}>
          CLUB NAME
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Delhi Runners"
          placeholderTextColor="#555"
          maxLength={100}
          style={styles.input}
        />

        <Text style={styles.counter}>
          {name.length}/100
        </Text>

        <Text
          style={[
            styles.label,
            styles.descriptionLabel,
          ]}>
          DESCRIPTION
        </Text>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tell runners what this club is about..."
          placeholderTextColor="#555"
          multiline
          maxLength={500}
          textAlignVertical="top"
          style={[
            styles.input,
            styles.descriptionInput,
          ]}
        />

        <Text style={styles.counter}>
          {description.length}/500
        </Text>

        <TouchableOpacity
          style={[
            styles.createButton,
            !name.trim() &&
              styles.createButtonDisabled,
          ]}
          onPress={createClub}
          disabled={
            loading ||
            !name.trim()
          }>

          {loading ? (
            <ActivityIndicator
              size="small"
              color="#000"
            />
          ) : (
            <Text style={styles.createButtonText}>
              CREATE CLUB
            </Text>
          )}

        </TouchableOpacity>

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
    padding: 20,
    paddingBottom: 40,
  },

  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 10,
  },

  subtitle: {
    color: '#666',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 26,
  },

  errorBox: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
  },

  label: {
    color: '#777',
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 7,
  },

  descriptionLabel: {
    marginTop: 18,
  },

  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 13,
    minHeight: 48,
    color: '#fff',
    paddingHorizontal: 13,
    fontSize: 13,
  },

  descriptionInput: {
    minHeight: 130,
    paddingTop: 13,
  },

  counter: {
    color: '#555',
    fontSize: 9,
    marginTop: 5,
    textAlign: 'right',
  },

  createButton: {
    marginTop: 28,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  createButtonDisabled: {
    backgroundColor: '#333',
  },

  createButtonText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
});

export default CreateClubScreen;
