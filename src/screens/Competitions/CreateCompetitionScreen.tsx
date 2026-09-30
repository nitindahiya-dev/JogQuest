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
    'CreateCompetition'
  >;

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

type Metric =
  | 'DISTANCE'
  | 'TERRITORY'
  | 'ACTIVITIES';

const CreateCompetitionScreen = () => {
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
    metric,
    setMetric,
  ] = useState<Metric>(
    'DISTANCE',
  );

  const [
    duration,
    setDuration,
  ] = useState('7');

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const createCompetition =
    async () => {
      if (loading) {
        return;
      }

      const cleanName =
        name.trim();

      const cleanDescription =
        description.trim();

      if (!cleanName) {
        setError(
          'Competition name is required.',
        );
        return;
      }

      const durationDays =
        Number(duration);

      if (
        !Number.isFinite(
          durationDays,
        ) ||
        durationDays < 1 ||
        durationDays > 90
      ) {
        setError(
          'Duration must be between 1 and 90 days.',
        );
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/competitions`,
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

                metric,

                durationDays,
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
              'Failed to create competition',
          );
        }

        if (!data.id) {
          throw new Error(
            'Competition ID was not returned.',
          );
        }

        navigation.replace(
          'CompetitionDetails',
          {
            competitionId:
              data.id,
          },
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to create competition',
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
          Create Competition
        </Text>

        <Text style={styles.subtitle}>
          Challenge the community and
          track progress together.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        <Text style={styles.label}>
          NAME
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Delhi 50K Challenge"
          placeholderTextColor="#555"
          maxLength={120}
          style={styles.input}
        />

        <Text style={styles.counter}>
          {name.length}/120
        </Text>

        <Text
          style={[
            styles.label,
            styles.labelSpacing,
          ]}>
          DESCRIPTION
        </Text>

        <TextInput
          value={description}
          onChangeText={
            setDescription
          }
          placeholder="Describe the challenge..."
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

        <Text
          style={[
            styles.label,
            styles.labelSpacing,
          ]}>
          COMPETITION METRIC
        </Text>

        <View style={styles.metricRow}>

          {(
            [
              'DISTANCE',
              'TERRITORY',
              'ACTIVITIES',
            ] as Metric[]
          ).map(item => (
            <TouchableOpacity
              key={item}
              style={[
                styles.metricButton,
                metric === item &&
                  styles.metricButtonActive,
              ]}
              onPress={() =>
                setMetric(item)
              }>

              <Text
                style={[
                  styles.metricText,
                  metric === item &&
                    styles.metricTextActive,
                ]}>
                {item}
              </Text>

            </TouchableOpacity>
          ))}

        </View>

        <Text
          style={[
            styles.label,
            styles.labelSpacing,
          ]}>
          DURATION
        </Text>

        <View style={styles.durationRow}>

          {['3', '7', '14', '30'].map(
            days => (
              <TouchableOpacity
                key={days}
                style={[
                  styles.durationButton,
                  duration === days &&
                    styles.durationButtonActive,
                ]}
                onPress={() =>
                  setDuration(days)
                }>

                <Text
                  style={[
                    styles.durationText,
                    duration === days &&
                      styles.durationTextActive,
                  ]}>
                  {days}D
                </Text>

              </TouchableOpacity>
            ),
          )}

        </View>

        <TouchableOpacity
          style={[
            styles.createButton,
            !name.trim() &&
              styles.createButtonDisabled,
          ]}
          onPress={
            createCompetition
          }
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
            <Text
              style={
                styles.createButtonText
              }>
              CREATE COMPETITION
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
    fontSize: 25,
    fontWeight: '900',
    marginTop: 10,
  },

  subtitle: {
    color: '#666',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 25,
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

  labelSpacing: {
    marginTop: 19,
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
    minHeight: 125,
    paddingTop: 13,
  },

  counter: {
    color: '#555',
    fontSize: 9,
    textAlign: 'right',
    marginTop: 5,
  },

  metricRow: {
    flexDirection: 'row',
    gap: 7,
  },

  metricButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 11,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#292929',
    alignItems: 'center',
    justifyContent: 'center',
  },

  metricButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },

  metricText: {
    color: '#777',
    fontSize: 8,
    fontWeight: '900',
  },

  metricTextActive: {
    color: '#000',
  },

  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },

  durationButton: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#292929',
    alignItems: 'center',
    justifyContent: 'center',
  },

  durationButtonActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },

  durationText: {
    color: '#777',
    fontSize: 10,
    fontWeight: '900',
  },

  durationTextActive: {
    color: '#000',
  },

  createButton: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },

  createButtonDisabled: {
    backgroundColor: '#333',
  },

  createButtonText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
});

export default CreateCompetitionScreen;
