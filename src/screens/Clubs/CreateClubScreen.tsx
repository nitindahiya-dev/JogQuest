import { API_BASE_URL } from '../../config/api';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  SHADOWS,
} from '../../theme';



const CreateClubScreen = () => {
  const { user, token } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createClub = async () => {
    if (!user?.id) return;

    const cleanName = name.trim();

    if (!cleanName) {
      setError('Club name is required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/clubs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          name: cleanName,
          description: description.trim(),
        }),
      });

      const data: any = await response.json();

      if (!response.ok || !data.id) {
        throw new Error(data.error ?? 'Failed to create club');
      }

      navigation.replace('ClubDetails', {
        clubId: data.id,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create club',
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
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>CREATE CLUB</Text>

        <Text style={styles.subtitle}>
          Build a community around your running goals.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>CLUB NAME</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Delhi Runners"
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
            style={styles.input}
          />

          <Text style={styles.counter}>{name.length}/100</Text>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.label}>DESCRIPTION</Text>

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell runners what this club is about..."
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

        <TouchableOpacity
          style={[
            styles.createButton,
            (!name.trim() || loading) && styles.disabledButton,
          ]}
          onPress={createClub}
          disabled={loading || !name.trim()}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.background} />
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
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.xl,
    paddingTop: 40,
  },

  title: {
    ...TYPOGRAPHY.hero,
    fontSize: 30,
  },

  subtitle: {
    ...TYPOGRAPHY.body,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },

  errorBox: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  errorText: {
    color: COLORS.danger,
    fontSize: 13,
  },

  inputWrapper: {
    marginBottom: SPACING.md,
  },

  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.xs,
  },

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    minHeight: 56,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
  },

  descriptionInput: {
    minHeight: 140,
    paddingTop: SPACING.md,
  },

  counter: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },

  createButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.glow,
  },

  disabledButton: {
    opacity: 0.5,
  },

  createButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontSize: 13,
  },
});

export default CreateClubScreen;