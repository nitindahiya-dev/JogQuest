import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme';
import {
  UserIcon,
  MailIcon,
  LockIcon,
  ChevronRightIcon,
  AlertCircleIcon,
} from '../../components/Icons';
import { useAuth } from '../../auth/AuthContext';

const API_BASE_URL = 'http://127.0.0.1:4000';
type EditableField = 'display_name' | 'username';

const ProfileDetailsScreen = () => {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [profile, setProfile] = useState(user);
  const [field, setField] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load profile');
        if (active) setProfile(data);
      } catch (error) {
        if (active) Alert.alert('Profile unavailable', error instanceof Error ? error.message : 'Could not load profile.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadProfile();
    return () => { active = false; };
  }, [token]);

  const openEditor = (target: EditableField) => {
    if (!profile) return;
    setField(target);
    setDraft(target === 'display_name' ? profile.display_name : profile.username);
  };

  const saveField = async () => {
    if (!field || !token) return;
    const value = draft.trim();
    if (!value) {
      Alert.alert('Required', 'This field cannot be empty.');
      return;
    }
    if (field === 'username' && !/^[a-zA-Z0-9_]{3,50}$/.test(value)) {
      Alert.alert('Invalid username', 'Use 3–50 letters, numbers, or underscores.');
      return;
    }
    if (field === 'display_name' && value.length > 100) {
      Alert.alert('Name too long', 'Display name must be 100 characters or fewer.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/me/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Profile update failed');
      setProfile(current => current ? { ...current, ...data } : current);
      setField(null);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (
    icon: React.ReactNode,
    label: string,
    value: string | null | undefined,
    onPress: () => void,
    options?: { last?: boolean; danger?: boolean; disabled?: boolean; helper?: string },
  ) => (
    <TouchableOpacity
      style={[styles.row, options?.last && styles.rowLast, options?.disabled && styles.rowDisabled]}
      onPress={onPress}
      activeOpacity={options?.disabled ? 1 : 0.7}
      disabled={options?.disabled}>
      <View style={[styles.iconBox, options?.danger && styles.iconBoxDanger]}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, options?.danger && styles.dangerText]}>{label}</Text>
        {!!value && <Text style={styles.rowValue}>{value}</Text>}
        {!!options?.helper && <Text style={styles.helperText}>{options.helper}</Text>}
      </View>
      {options?.disabled ? null : <ChevronRightIcon color={COLORS.textMuted} size={20} />}
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>ACCOUNT INFORMATION</Text>
        <View style={styles.card}>
          {renderRow(<UserIcon color={COLORS.accent} size={18} />, 'Display Name', loading ? 'Loading…' : profile?.display_name || 'Not set', () => openEditor('display_name'))}
          {renderRow(<UserIcon color={COLORS.accent} size={18} />, 'Username', profile?.username ? `@${profile.username}` : 'Not set', () => openEditor('username'))}
          {renderRow(<MailIcon color={COLORS.accent} size={18} />, 'Email Address', profile?.email || 'No email on account', () => Alert.alert('Email address', 'Email changes are not enabled until email verification is implemented.'), { last: true, helper: 'Email changes require verification.' })}
        </View>

        <Text style={styles.sectionLabel}>SECURITY</Text>
        <View style={styles.card}>
          {renderRow(<LockIcon color={COLORS.accent} size={18} />, 'Password', 'Password management is not configured yet', () => Alert.alert('Not available yet', 'A secure password-change endpoint is not implemented on the server.'), { last: true })}
        </View>

        <Text style={[styles.sectionLabel, styles.dangerHeading]}>DANGER ZONE</Text>
        <View style={[styles.card, styles.cardDanger]}>
          {renderRow(<AlertCircleIcon color={COLORS.danger} size={18} />, 'Delete Account', 'Account deletion is not available yet', () => Alert.alert('Not available yet', 'Account deletion needs a verified, transactional server flow.'), { last: true, danger: true })}
        </View>
      </ScrollView>

      <Modal visible={field !== null} transparent animationType="fade" onRequestClose={() => !saving && setField(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{field === 'display_name' ? 'Edit display name' : 'Edit username'}</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={field === 'display_name' ? 100 : 50}
              placeholder={field === 'display_name' ? 'Display name' : 'Username'}
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              editable={!saving}
              autoFocus
            />
            {field === 'username' && <Text style={styles.helperText}>3–50 letters, numbers, or underscores.</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setField(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveField} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  contentContainer: { padding: SPACING.md, paddingTop: 24 },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textMuted, marginBottom: 12, marginTop: 8, paddingLeft: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24, overflow: 'hidden' },
  cardDanger: { borderColor: 'rgba(255, 77, 77, 0.3)' },
  row: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLast: { borderBottomWidth: 0 },
  rowDisabled: { opacity: 0.9 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(212, 255, 0, 0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  iconBoxDanger: { backgroundColor: 'rgba(255, 77, 77, 0.1)' },
  rowContent: { flex: 1 },
  rowLabel: { ...TYPOGRAPHY.h3, fontSize: 14, color: COLORS.text },
  rowValue: { ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  helperText: { ...TYPOGRAPHY.body, fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  dangerHeading: { color: COLORS.danger, marginTop: 8 },
  dangerText: { color: COLORS.danger },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 20 },
  modalTitle: { ...TYPOGRAPHY.h3, color: COLORS.text, fontSize: 18, marginBottom: 16 },
  input: { color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  cancelText: { color: COLORS.textMuted, fontWeight: '600' },
  saveButton: { minWidth: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  saveText: { color: COLORS.background, fontWeight: '700' },
});

export default ProfileDetailsScreen;
