import { API_BASE_URL } from '../../config/api';
import React, { useState } from 'react';
import Geolocation from '@react-native-community/geolocation';
import DateTimePicker from '@react-native-community/datetimepicker';

import {
  ActivityIndicator,
  PermissionsAndroid,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

import { useAuth } from '../../auth/AuthContext';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'CreateCompetition'
>;

type Metric = 'DISTANCE' | 'TERRITORY' | 'ACTIVITIES';
type CompetitionLocation = { latitude: number; longitude: number };



const COLORS = {
  background: '#0A0A0A',
  surface: '#121212',
  surfaceLight: '#171717',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
  danger: '#FF4D4D',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const METRICS: {
  value: Metric;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'DISTANCE',
    title: 'Distance',
    description: 'Compete on total distance covered.',
    icon: '↗',
  },
  {
    value: 'TERRITORY',
    title: 'Territory',
    description: 'Compete through territory exploration.',
    icon: '⌖',
  },
  {
    value: 'ACTIVITIES',
    title: 'Activities',
    description: 'Compete by completing activities.',
    icon: '✓',
  },
];

const CreateCompetitionScreen = () => {
  const { user, token } = useAuth();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<Metric>('DISTANCE');
  const [startAt, setStartAt] = useState(
    () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const [endAt, setEndAt] = useState(
    () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  );
  const [targetDistanceKm, setTargetDistanceKm] = useState('');
  const [activeDatePicker, setActiveDatePicker] = useState<
    'startDate' | 'startTime' | 'endDate' | 'endTime' | null
  >(null);

  const [entryType, setEntryType] = useState<'FREE' | 'PAID'>('FREE');
  const [entryFee, setEntryFee] = useState('');
  const [prizeType, setPrizeType] = useState<'NONE' | 'CASH' | 'SPONSORED' | 'MIXED'>('NONE');
  const [firstPrize, setFirstPrize] = useState('');
  const [secondPrize, setSecondPrize] = useState('');
  const [thirdPrize, setThirdPrize] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [competitionLocation, setCompetitionLocation] = useState<CompetitionLocation | null>(null);

  const useCurrentLocation = async () => {
    try {
      setError(null);

      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Attach challenge location',
            message: 'Allow JogQuest to attach your current location to this challenge.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
          },
        );

        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Location permission was not granted.');
        }
      }

      const location = await new Promise<CompetitionLocation>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          position => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
          error => reject(new Error(
            error.code === 1
              ? 'Location permission denied. Enable it in Android settings.'
              : 'Could not get your current location. Enable device location and try again.',
          )),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
        );
      });

      setCompetitionLocation(location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location.');
    }
  };

  const createCompetition = async () => {
    if (loading) return;

    if (!user?.id) {
      setError('Please log in before creating a competition.');
      return;
    }

    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const cleanTargetDistanceKm =
      targetDistanceKm.trim() === '' ? null : Number(targetDistanceKm);

    if (!cleanName) {
      setError('Competition name is required.');
      return;
    }

    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt.getTime() <= startAt.getTime()
    ) {
      setError('Choose a valid end date and time after the start date and time.');
      return;
    }

    if (
      endAt.getTime() - startAt.getTime() > 90 * 86400000
    ) {
      setError('Challenge duration cannot exceed 90 days.');
      return;
    }

    if (
      metric === 'DISTANCE' &&
      (
        cleanTargetDistanceKm === null ||
        !Number.isFinite(cleanTargetDistanceKm) ||
        cleanTargetDistanceKm <= 0 ||
        cleanTargetDistanceKm > 100000
      )
    ) {
      setError('Enter a distance target greater than 0 and no more than 100000 km.');
      return;
    }

    const entryFeePaise = Math.round(Number(entryFee || 0) * 100);
    const firstPrizePaise = Math.round(Number(firstPrize || 0) * 100);
    const secondPrizePaise = Math.round(Number(secondPrize || 0) * 100);
    const thirdPrizePaise = Math.round(Number(thirdPrize || 0) * 100);
    const cashPrizePaise = firstPrizePaise + secondPrizePaise + thirdPrizePaise;

    if (entryType === 'PAID' &&
        (!Number.isFinite(Number(entryFee)) || entryFeePaise <= 0)) {
      setError('Enter a valid positive entry fee in rupees.');
      return;
    }
    if (prizeType === 'CASH' || prizeType === 'MIXED') {
      if (
        [firstPrize, secondPrize, thirdPrize].some(
          value => value.trim() !== '' &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)
        )
      ) {
        setError('Enter valid non-negative prize amounts.');
        return;
      }
      if (cashPrizePaise <= 0) {
        setError('Enter at least one cash prize allocation.');
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            name: cleanName,
            description: cleanDescription,
            metric,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            targetDistanceKm: cleanTargetDistanceKm,
            entryType,
            entryFeePaise: entryType === 'PAID' ? entryFeePaise : 0,
            prizeType,
            cashPrizePaise:
              prizeType === 'CASH' || prizeType === 'MIXED'
                ? cashPrizePaise
                : 0,
            prizeDistribution: {
              first: prizeType === 'CASH' || prizeType === 'MIXED' ? firstPrizePaise : 0,
              second: prizeType === 'CASH' || prizeType === 'MIXED' ? secondPrizePaise : 0,
              third: prizeType === 'CASH' || prizeType === 'MIXED' ? thirdPrizePaise : 0,
            },
            ...(competitionLocation ? {
              latitude: competitionLocation.latitude,
              longitude: competitionLocation.longitude,
            } : {}),
          }),
        },
      );

      const data: any = await response.json();

      if (!response.ok || !data.id) {
        throw new Error(
          data?.error ?? 'Failed to create competition.',
        );
      }

      navigation.replace('CompetitionDetails', {
        competitionId: data.id,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create competition.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 36 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>
              COMMUNITY / CHALLENGES
            </Text>
          </View>

          <Text style={styles.title}>
            CREATE A{'\n'}
            <Text style={styles.titleAccent}>CHALLENGE.</Text>
          </Text>

          <Text style={styles.subtitle}>
            Bring runners together. Set a goal. Make every
            kilometre count.
          </Text>
        </View>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          <View style={styles.progressActive} />
          <View style={styles.progressInactive} />
          <View style={styles.progressInactive} />

          <Text style={styles.progressLabel}>CHALLENGE SETUP</Text>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>

            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Something went wrong
              </Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        )}

        {/* Name */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>01</Text>
            </View>

            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>
                Name your challenge
              </Text>
              <Text style={styles.sectionSubtitle}>
                Give your community something to chase.
              </Text>
            </View>
          </View>

          <TextInput
            value={name}
            onChangeText={value => {
              setName(value);
              if (error) setError(null);
            }}
            placeholder="e.g. Delhi 50K Challenge"
            placeholderTextColor={COLORS.textMuted}
            maxLength={120}
            returnKeyType="next"
            style={styles.input}
          />

          <Text style={styles.counter}>{name.length}/120</Text>

          <Text style={styles.label}>DESCRIPTION</Text>

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this challenge about? Tell participants what to expect..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            style={[styles.input, styles.descriptionInput]}
          />

          <Text style={styles.counter}>
            {description.length}/500
          </Text>
        </View>

        {/* Optional location */}
        <View style={styles.locationCard}>
          <View style={styles.locationCardText}>
            <Text style={styles.locationTitle}>CHALLENGE LOCATION (OPTIONAL)</Text>
            <Text style={styles.locationDescription}>
              {competitionLocation
                ? 'Current location attached. Nearby runners can discover this challenge.'
                : 'Attach your current GPS location so nearby runners can discover it.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.locationButton}
            onPress={competitionLocation ? () => setCompetitionLocation(null) : useCurrentLocation}
            activeOpacity={0.85}
          >
            <Text style={styles.locationButtonText}>
              {competitionLocation ? 'REMOVE LOCATION' : 'USE MY LOCATION'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Metric */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>02</Text>
            </View>

            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>
                Choose your metric
              </Text>
              <Text style={styles.sectionSubtitle}>
                Decide how participants compete.
              </Text>
            </View>
          </View>

          <View style={styles.metricList}>
            {METRICS.map(item => {
              const selected = metric === item.value;

              return (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.metricCard,
                    selected && styles.metricCardActive,
                  ]}
                  onPress={() => setMetric(item.value)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.metricIcon,
                      selected && styles.metricIconActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricIconText,
                        selected && styles.metricIconTextActive,
                      ]}
                    >
                      {item.icon}
                    </Text>
                  </View>

                  <View style={styles.metricContent}>
                    <Text
                      style={[
                        styles.metricTitle,
                        selected && styles.metricTitleActive,
                      ]}
                    >
                      {item.title}
                    </Text>

                    <Text style={styles.metricDescription}>
                      {item.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radioOuter,
                      selected && styles.radioOuterActive,
                    ]}
                  >
                    {selected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Schedule and target */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>03</Text>
            </View>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>Schedule the challenge</Text>
              <Text style={styles.sectionSubtitle}>
                Choose exactly when the challenge starts and ends.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>START DATE</Text>
          <TouchableOpacity
            style={styles.durationCard}
            onPress={() => setActiveDatePicker('startDate')}
            activeOpacity={0.85}
          >
            <Text style={styles.durationLabel}>
              {startAt.toLocaleDateString()}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>START TIME</Text>
          <TouchableOpacity
            style={styles.durationCard}
            onPress={() => setActiveDatePicker('startTime')}
            activeOpacity={0.85}
          >
            <Text style={styles.durationLabel}>
              {startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>END DATE</Text>
          <TouchableOpacity
            style={styles.durationCard}
            onPress={() => setActiveDatePicker('endDate')}
            activeOpacity={0.85}
          >
            <Text style={styles.durationLabel}>
              {endAt.toLocaleDateString()}
            </Text>
          </TouchableOpacity>

          <Text style={styles.label}>END TIME</Text>
          <TouchableOpacity
            style={styles.durationCard}
            onPress={() => setActiveDatePicker('endTime')}
            activeOpacity={0.85}
          >
            <Text style={styles.durationLabel}>
              {endAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {activeDatePicker !== null && (
            <DateTimePicker
              value={
                activeDatePicker.startsWith('start')
                  ? startAt
                  : endAt
              }
              mode={
                activeDatePicker.endsWith('Date') ? 'date' : 'time'
              }
              minimumDate={
                activeDatePicker.startsWith('end') ? startAt : undefined
              }
              onChange={(event, selectedDate) => {
                if (event.type === 'dismissed') {
                  setActiveDatePicker(null);
                  return;
                }

                if (selectedDate) {
                  if (activeDatePicker.startsWith('start')) {
                    setStartAt(selectedDate);
                  } else {
                    setEndAt(selectedDate);
                  }
                }

                setActiveDatePicker(null);
              }}
            />
          )}

          <View style={styles.durationSummary}>
            <Text style={styles.durationSummaryLabel}>CHALLENGE WINDOW</Text>
            <Text style={styles.durationSummaryValue}>
              {startAt.toLocaleString()} — {endAt.toLocaleString()}
            </Text>
          </View>

          {metric === 'DISTANCE' && (
            <View>
              <Text style={styles.label}>TARGET DISTANCE (KM)</Text>
              <TextInput
                value={targetDistanceKm}
                onChangeText={setTargetDistanceKm}
                placeholder="e.g. 50"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.sectionSubtitle}>
                Participants compete to reach this total distance.
              </Text>
            </View>
          )}
        </View>

        {/* Entry and prizes */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>04</Text>
            </View>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>Entry & prizes</Text>
              <Text style={styles.sectionSubtitle}>
                Configure the challenge's entry fee and rewards.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>ENTRY TYPE</Text>
          <View style={styles.durationGrid}>
            {(['FREE', 'PAID'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.durationCard,
                  entryType === type && styles.durationCardActive,
                ]}
                onPress={() => {
                  setEntryType(type);
                  if (type === 'FREE') setEntryFee('');
                }}
              >
                <Text style={[
                  styles.durationLabel,
                  entryType === type && styles.durationLabelActive,
                ]}>
                  {type === 'FREE' ? 'FREE ENTRY' : 'PAID ENTRY'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {entryType === 'PAID' && (
            <View>
              <Text style={styles.label}>ENTRY FEE (₹)</Text>
              <TextInput
                value={entryFee}
                onChangeText={setEntryFee}
                placeholder="e.g. 99"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.sectionSubtitle}>
                Payment collection is not active yet. This challenge will remain a draft.
              </Text>
            </View>
          )}

          <Text style={styles.label}>PRIZE TYPE</Text>
          <View style={styles.metricList}>
            {([
              ['NONE', 'No prize'],
              ['CASH', 'Cash prizes'],
              ['SPONSORED', 'Sponsored rewards'],
              ['MIXED', 'Cash + sponsored'],
            ] as const).map(([type, label]) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.durationCard,
                  prizeType === type && styles.durationCardActive,
                ]}
                onPress={() => {
                  setPrizeType(type);
                  if (type === 'NONE' || type === 'SPONSORED') {
                    setFirstPrize('');
                    setSecondPrize('');
                    setThirdPrize('');
                  }
                }}
              >
                <Text style={[
                  styles.durationLabel,
                  prizeType === type && styles.durationLabelActive,
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(prizeType === 'CASH' || prizeType === 'MIXED') && (
            <View>
              <Text style={styles.label}>CASH PRIZE ALLOCATION (₹)</Text>
              <Text style={styles.sectionSubtitle}>
                Enter the amount allocated to each finishing position.
              </Text>
              {([
                ['First place', firstPrize, setFirstPrize],
                ['Second place', secondPrize, setSecondPrize],
                ['Third place', thirdPrize, setThirdPrize],
              ] as const).map(([label, value, setter]) => (
                <View key={label}>
                  <Text style={styles.label}>{label.toUpperCase()}</Text>
                  <TextInput
                    value={value}
                    onChangeText={setter}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              ))}
              <Text style={styles.durationSummaryValue}>
                Total cash prize: ₹{(
                  (Number(firstPrize) || 0) +
                  (Number(secondPrize) || 0) +
                  (Number(thirdPrize) || 0)
                ).toFixed(2)}
              </Text>
              <Text style={styles.sectionSubtitle}>
                Cash payouts are not active yet. This challenge will remain a draft.
              </Text>
            </View>
          )}

          {prizeType === 'SPONSORED' || prizeType === 'MIXED' ? (
            <Text style={styles.sectionSubtitle}>
              Sponsored rewards are managed separately through the existing sponsored rewards system.
            </Text>
          ) : null}
        </View>

        {/* Preview */}
        <View style={styles.previewCard}>
          <View style={styles.previewTop}>
            <Text style={styles.previewLabel}>CHALLENGE PREVIEW</Text>

            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>DRAFT</Text>
            </View>
          </View>

          <Text style={styles.previewName} numberOfLines={2}>
            {name.trim() || 'Your challenge name'}
          </Text>

          <Text style={styles.previewDescription} numberOfLines={3}>
            {description.trim() || 'Your challenge description will appear here.'}
          </Text>

          <View style={styles.previewFooter}>
            <View>
              <Text style={styles.previewMetaLabel}>METRIC</Text>
              <Text style={styles.previewMetaValue}>{metric}</Text>
            </View>

            <View style={styles.previewDivider} />

            <View>
              <Text style={styles.previewMetaLabel}>SCHEDULE</Text>
              <Text style={styles.previewMetaValue}>
                {startAt.toLocaleDateString()} – {endAt.toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.previewDivider} />

            <View>
              <Text style={styles.previewMetaLabel}>ENTRY</Text>
              <Text style={styles.previewMetaValue}>
                {entryType === 'PAID' ? `₹${entryFee || '0'}` : 'FREE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.createButton,
            (!name.trim() || loading) && styles.createButtonDisabled,
          ]}
          onPress={createCompetition}
          disabled={loading || !name.trim()}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.background} />
          ) : (
            <>
              <Text style={styles.createButtonText}>
                CREATE CHALLENGE
              </Text>
              <Text style={styles.createButtonArrow}>↗</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Review your details before creating your challenge.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default CreateCompetitionScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: 22,
  },

  // Header
  header: {
    marginBottom: SPACING.lg,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },

  eyebrow: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  title: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1,
  },

  titleAccent: {
    color: COLORS.accent,
  },

  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: SPACING.md,
    maxWidth: 320,
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },

  progressActive: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    marginRight: 5,
  },

  progressInactive: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceLight,
    marginRight: 5,
  },

  progressLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginLeft: 8,
  },

  // Sections
  section: {
    marginBottom: SPACING.xl,
  },

  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  sectionNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(212,255,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  sectionNumberText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
  },

  sectionHeadingText: {
    flex: 1,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  label: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    minHeight: 54,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    fontSize: 14,
  },

  descriptionInput: {
    minHeight: 120,
    paddingTop: SPACING.md,
    lineHeight: 20,
  },

  counter: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
  },

  locationCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  locationCardText: {
    marginBottom: 12,
  },
  locationTitle: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  locationDescription: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  locationButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationButtonText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Metric options
  metricList: {
    gap: 10,
  },

  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    padding: 13,
  },

  metricCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,255,0,0.045)',
  },

  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  metricIconActive: {
    backgroundColor: COLORS.accent,
  },

  metricIconText: {
    color: COLORS.textSecondary,
    fontSize: 23,
    fontWeight: '800',
  },

  metricIconTextActive: {
    color: COLORS.background,
  },

  metricContent: {
    flex: 1,
    paddingRight: 8,
  },

  metricTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },

  metricTitleActive: {
    color: COLORS.accent,
  },

  metricDescription: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  radioOuter: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioOuterActive: {
    borderColor: COLORS.accent,
  },

  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },

  // Duration
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  durationCard: {
    width: '31%',
    minHeight: 84,
    flexGrow: 1,
    flexBasis: '28%',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  durationCardActive: {
    backgroundColor: 'rgba(212,255,0,0.08)',
    borderColor: COLORS.accent,
  },

  durationNumber: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: '900',
  },

  durationNumberActive: {
    color: COLORS.accent,
  },

  durationLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 3,
  },

  durationLabelActive: {
    color: COLORS.accent,
  },

  durationSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 13,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },

  durationSummaryLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  durationSummaryValue: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
  },

  // Preview
  previewCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },

  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  previewLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  previewBadge: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  previewBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  previewName: {
    color: COLORS.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },

  previewDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  previewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  previewDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
  },

  previewMetaLabel: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  previewMetaValue: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 5,
  },

  // Submit
  createButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 17,
    paddingHorizontal: SPACING.lg,
  },

  createButtonDisabled: {
    opacity: 0.5,
  },

  createButtonText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  createButtonArrow: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 10,
  },

  footerNote: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: SPACING.md,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.3)',
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },

  errorIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,77,77,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  errorIconText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '900',
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '900',
  },

  errorText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});