import { API_BASE_URL } from '../../config/api';
import React, { useCallback, useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';

import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthContext';
import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from '../../theme';



type Metric = 'DISTANCE' | 'TERRITORY' | 'ACTIVITIES';

type Competition = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  metric: Metric;
  start_at: string;
  end_at: string;
  target_distance_km?: number | string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  max_participants?: number | null;
  participants_count: number;
  entry_type?: 'FREE' | 'PAID';
  entry_fee_paise?: number | string;
  prize_type?: 'NONE' | 'CASH' | 'SPONSORED' | 'MIXED';
  cash_prize_paise?: number | string;
  prize_distribution?: {
    first?: number | string;
    second?: number | string;
    third?: number | string;
  } | null;
  currency?: string;
};

type LeaderboardEntry = {
  user_id: string;
  rank: number;
  score: number;
  display_name: string;
  username: string;
};

type OfficialCompetitionResult = {
  rank_position: number;
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  score: number | string;
  metric: Metric;
  finalized_at: string;
  badges?: Array<{
    code: string;
    name: string;
    icon: string;
  }>;
};

type Membership = {
  joined?: boolean;
  error?: string;
};

type OrganizerParticipant = {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  joined_at?: string;
  total_score: number | string;
  review_score_count?: number;
  unresolved_flags?: number;
};

type OrganizerFlag = {
  activity_id: string;
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  reason?: string | null;
  details?: string | null;
  created_at?: string;
};

type OrganizerEvidence = {
  challenge?: Record<string, any>;
  participant?: Record<string, any>;
  scores?: Array<Record<string, any>>;
  flags?: Array<Record<string, any>>;
};

type ParticipantProgress = {
  rank: number | null;
  total_score: number | string;
  review_count: number;
  participant_count: number;
  breakdown: Array<{
    metric: string;
    score: number | string;
    reviewCount: number;
    scoredActivities: number;
  }>;
};

const CompetitionDetailsScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();

  const userId = user?.id;
  const { competitionId } = route.params;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [joined, setJoined] = useState(false);
  const [progress, setProgress] = useState<ParticipantProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [officialResults, setOfficialResults] =
    useState<OfficialCompetitionResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const [isOrganizer, setIsOrganizer] = useState(false);
  const [organizerLoading, setOrganizerLoading] = useState(false);
  const [organizerParticipants, setOrganizerParticipants] = useState<OrganizerParticipant[]>([]);
  const [organizerFlags, setOrganizerFlags] = useState<OrganizerFlag[]>([]);
  const [organizerError, setOrganizerError] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [organizerActionLoading, setOrganizerActionLoading] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<OrganizerEvidence | null>(null);
  const [evidenceLoadingFor, setEvidenceLoadingFor] = useState<string | null>(null);
  // Phase 7: score corrections, audit history, and cancellation.
  const [correctionActivityId, setCorrectionActivityId] = useState('');
  const [correctionScore, setCorrectionScore] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [organizerAudit, setOrganizerAudit] = useState<Array<Record<string, any>>>([]);
  const [organizerAuditLoading, setOrganizerAuditLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // JQ_PHASE7_REWARD_DELIVERY_UI
  const [adminRewards, setAdminRewards] = useState<any[]>([]);
  const [deliveryFailures, setDeliveryFailures] = useState<any[]>([]);
  const [rewardParticipantId, setRewardParticipantId] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [rewardStatus, setRewardStatus] = useState('PENDING');
  const [rewardReason, setRewardReason] = useState('');
  const [rewardNotes, setRewardNotes] = useState('');
  const [operationsLoading, setOperationsLoading] = useState(false);

  // PHASE 8: sponsored reward offers and claims.
  const [sponsoredOffers, setSponsoredOffers] = useState<any[]>([]);
  const [participantSponsoredOffers, setParticipantSponsoredOffers] = useState<any[]>([]);
  const [sponsoredClaims, setSponsoredClaims] = useState<any[]>([]);
  const [sponsoredLoading, setSponsoredLoading] = useState(false);
  const [sponsorNameInput, setSponsorNameInput] = useState('');
  const [sponsoredRewardNameInput, setSponsoredRewardNameInput] = useState('');
  const [sponsoredDescriptionInput, setSponsoredDescriptionInput] = useState('');
  const [sponsoredQuantityInput, setSponsoredQuantityInput] = useState('1');
  const [sponsoredEligibilityInput, setSponsoredEligibilityInput] = useState('ALL_PARTICIPANTS');
  const [sponsoredDeadlineInput, setSponsoredDeadlineInput] = useState('');
  const [sponsoredPolicyInput, setSponsoredPolicyInput] = useState('EXPIRE');
  const [sponsoredOfferReason, setSponsoredOfferReason] = useState('');
  const [sponsoredClaimReason, setSponsoredClaimReason] = useState('');
  const [sponsoredActionLoading, setSponsoredActionLoading] = useState(false);

  // PHASE7_DRAFT_EDIT_PUBLISH
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftMetric, setDraftMetric] = useState<Metric>('DISTANCE');
  const [draftStartAt, setDraftStartAt] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const [draftEndAt, setDraftEndAt] = useState(
    new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  );
  const [draftTargetDistance, setDraftTargetDistance] = useState('');
  const [draftMaxParticipants, setDraftMaxParticipants] = useState('');
  const [activeDraftPicker, setActiveDraftPicker] = useState<
    'startDate' | 'startTime' | 'endDate' | 'endTime' | null
  >(null);
  const [draftEntryType, setDraftEntryType] = useState<'FREE' | 'PAID'>('FREE');
  const [draftEntryFee, setDraftEntryFee] = useState('');
  const [draftPrizeType, setDraftPrizeType] = useState<'NONE' | 'CASH' | 'SPONSORED' | 'MIXED'>('NONE');
  const [draftFirstPrize, setDraftFirstPrize] = useState('');
  const [draftSecondPrize, setDraftSecondPrize] = useState('');
  const [draftThirdPrize, setDraftThirdPrize] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);



  const loadCompetition = useCallback(async () => {
    if (!userId) {
      setError('Please log in to view competition details.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const [
        competitionResponse,
        leaderboardResponse,
        membershipResponse,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/competitions/${competitionId}`),
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/leaderboard`,
        ),
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/membership/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      ]);

      const competitionData: any = await competitionResponse.json();
      const leaderboardData: any = await leaderboardResponse.json();
      const membershipData = (await membershipResponse.json()) as Membership;

      if (!competitionResponse.ok) {
        throw new Error(
          competitionData?.error ?? 'Failed to load competition.',
        );
      }

      if (!leaderboardResponse.ok) {
        throw new Error(
          leaderboardData?.error ?? 'Failed to load leaderboard.',
        );
      }

      if (!membershipResponse.ok) {
        throw new Error(
          membershipData.error ?? 'Failed to load membership.',
        );
      }

      setCompetition(competitionData as Competition);
      const loadedStart = new Date(competitionData.start_at);
      const loadedEnd = new Date(competitionData.end_at);
      if (!Number.isNaN(loadedStart.getTime())) setDraftStartAt(loadedStart);
      if (!Number.isNaN(loadedEnd.getTime())) setDraftEndAt(loadedEnd);
      setDraftTargetDistance(
        competitionData.target_distance_km == null
          ? ''
          : String(competitionData.target_distance_km),
      );
      setDraftMaxParticipants(
        competitionData.max_participants == null
          ? ''
          : String(competitionData.max_participants),
      );
      setLeaderboard(
        Array.isArray(leaderboardData) ? leaderboardData : [],
      );
      const isJoined = membershipData.joined ?? false;
      setJoined(isJoined);

      // Progress is optional until the scoring migration is applied.
      // A progress API failure must not break the challenge details screen.
      if (isJoined && token) {
        try {
          const progressResponse = await fetch(
            `${API_BASE_URL}/api/competitions/${competitionId}/progress`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (progressResponse.ok) {
            setProgress(
              (await progressResponse.json()) as ParticipantProgress,
            );
          } else {
            setProgress(null);
          }
        } catch {
          setProgress(null);
        }
      } else {
        setProgress(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load competition.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId, userId, token]);

  const loadOrganizerPanel = useCallback(async () => {
    if (!token || !competitionId) {
      setIsOrganizer(false);
      return;
    }

    setOrganizerLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/participants?limit=100&offset=0`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!response.ok) {
        setIsOrganizer(false);
        setOrganizerParticipants([]);
        setOrganizerFlags([]);
        setSelectedEvidence(null);
        return;
      }

      const data: any = await response.json();
      setIsOrganizer(true);
      setOrganizerParticipants(
        Array.isArray(data?.participants) ? data.participants : [],
      );

      const flagsResponse = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/review-flags`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (flagsResponse.ok) {
        const flagsData: any = await flagsResponse.json();
        setOrganizerFlags(Array.isArray(flagsData?.flags) ? flagsData.flags : Array.isArray(flagsData) ? flagsData : []);
      } else {
        setOrganizerFlags([]);
      }
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to load organizer tools.',
      );
    } finally {
      setOrganizerLoading(false);
    }
  }, [competitionId, token]);

  const loadParticipantEvidence = useCallback(async (participantId: string) => {
    if (!token) return;

    setEvidenceLoadingFor(participantId);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/participants/${encodeURIComponent(participantId)}/evidence`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to load participant evidence.');
      }

      setSelectedEvidence(data as OrganizerEvidence);
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to load participant evidence.',
      );
    } finally {
      setEvidenceLoadingFor(null);
    }
  }, [competitionId, token]);


  const loadOrganizerAudit = useCallback(async () => {
    if (!token || !competitionId) return;

    setOrganizerAuditLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/audit?limit=50&offset=0`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to load organizer audit history.');
      }

      setOrganizerAudit(Array.isArray(data?.audit) ? data.audit : []);
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to load organizer audit history.',
      );
    } finally {
      setOrganizerAuditLoading(false);
    }
  }, [competitionId, token]);

  const correctOrganizerScore = useCallback(async () => {
    const activityId = correctionActivityId.trim();
    const reason = correctionReason.trim();
    const score = Number(correctionScore);

    if (!token || organizerActionLoading) return;

    if (!activityId) {
      setOrganizerError('Enter the activity ID to correct.');
      return;
    }
    if (
      !correctionScore.trim() ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1000000000
    ) {
      setOrganizerError('Enter a valid score between 0 and 1,000,000,000.');
      return;
    }
    if (!reason || reason.length > 1000) {
      setOrganizerError('A score correction reason of 1–1,000 characters is required.');
      return;
    }

    setOrganizerActionLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/activities/${encodeURIComponent(activityId)}/score`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ score, reason }),
        },
      );
      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to correct the activity score.');
      }

      setCorrectionActivityId('');
      setCorrectionScore('');
      setCorrectionReason('');

      await Promise.all([
        loadOrganizerPanel(),
        loadCompetition(),
        loadOrganizerAudit(),
      ]);

      if (selectedEvidence?.participant?.user_id) {
        await loadParticipantEvidence(
          String(selectedEvidence.participant.user_id),
        );
      }
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to correct the activity score.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    competitionId,
    correctionActivityId,
    correctionReason,
    correctionScore,
    loadCompetition,
    loadOrganizerAudit,
    loadOrganizerPanel,
    loadParticipantEvidence,
    organizerActionLoading,
    selectedEvidence,
    token,
  ]);


  const startOrganizerReview = useCallback(async () => {
    if (!token || organizerActionLoading) return;

    if (competition?.status !== 'ACTIVE') {
      setOrganizerError('Only active competitions can enter review.');
      return;
    }

    if (Date.now() < new Date(competition.end_at).getTime()) {
      setOrganizerError('The challenge cannot enter review before its end time.');
      return;
    }

    setOrganizerActionLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/review`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to start competition review.');
      }

      await Promise.all([
        loadCompetition(),
        loadOrganizerPanel(),
        loadOrganizerAudit(),
      ]);
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to start competition review.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    competition?.status,
    competition?.end_at,
    competitionId,
    token,
    organizerActionLoading,
    loadCompetition,
    loadOrganizerPanel,
    loadOrganizerAudit,
  ]);


  const finalizeOrganizerCompetition = useCallback(async () => {
    if (!token || organizerActionLoading) return;

    if (competition?.status !== 'UNDER_REVIEW') {
      setOrganizerError('The competition must be under review before finalization.');
      return;
    }

    setOrganizerActionLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/finalize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to finalize competition results.');
      }

      await Promise.all([
        loadCompetition(),
        loadOrganizerPanel(),
        loadOrganizerAudit(),
      ]);
    } catch (err) {
      setOrganizerError(
        err instanceof Error
          ? err.message
          : 'Failed to finalize competition results.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    competition?.status,
    competitionId,
    loadCompetition,
    loadOrganizerAudit,
    loadOrganizerPanel,
    organizerActionLoading,
    token,
  ]);

  const cancelOrganizerCompetition = useCallback(async () => {
    const reason = cancelReason.trim();

    if (!token || organizerActionLoading) return;

    if (!reason || reason.length > 1000) {
      setOrganizerError('A cancellation reason of 1–1,000 characters is required.');
      return;
    }

    setOrganizerActionLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
        },
      );
      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to cancel the competition.');
      }

      setCancelReason('');
      await Promise.all([loadCompetition(), loadOrganizerPanel(), loadOrganizerAudit()]);
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to cancel the competition.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    cancelReason,
    competitionId,
    loadCompetition,
    loadOrganizerAudit,
    loadOrganizerPanel,
    organizerActionLoading,
    token,
  ]);


  const saveOrganizerDraft = useCallback(async () => {
    if (!token || !competition || !isOrganizer || draftSaving) return;

    const name = draftName.trim();
    const description = draftDescription.trim();
    const targetDistanceKm =
      draftMetric === 'DISTANCE' ? Number(draftTargetDistance) : null;
    const maxParticipants =
      draftMaxParticipants.trim() === ''
        ? null
        : Number(draftMaxParticipants);

    if (!name || name.length > 120) {
      setOrganizerError('Name is required and must not exceed 120 characters.');
      return;
    }
    if (description.length > 500) {
      setOrganizerError('Description must not exceed 500 characters.');
      return;
    }
    if (
      Number.isNaN(draftStartAt.getTime()) ||
      Number.isNaN(draftEndAt.getTime()) ||
      draftEndAt.getTime() <= draftStartAt.getTime()
    ) {
      setOrganizerError('End date and time must be after the start date and time.');
      return;
    }

    if (
      draftMetric === 'DISTANCE' &&
      (!Number.isFinite(targetDistanceKm) ||
        targetDistanceKm === null ||
        targetDistanceKm <= 0 ||
        targetDistanceKm > 100000)
    ) {
      setOrganizerError('Enter a valid target distance greater than 0 km.');
      return;
    }

    if (
      maxParticipants !== null &&
      (!Number.isSafeInteger(maxParticipants) ||
        maxParticipants < 1 ||
        maxParticipants > 100000)
    ) {
      setOrganizerError('Maximum participants must be a whole number between 1 and 100000, or left blank for unlimited.');
      return;
    }

    const toPaise = (value: string): number | null => {
      const rupees = Number(value || 0);
      if (!Number.isFinite(rupees) || rupees < 0) return null;

      const paise = Math.round(rupees * 100);
      if (
        !Number.isSafeInteger(paise) ||
        Math.abs(rupees * 100 - paise) > 0.000001
      ) {
        return null;
      }

      return paise;
    };

    const enteredFeePaise = toPaise(draftEntryFee);
    const firstPaise = toPaise(draftFirstPrize);
    const secondPaise = toPaise(draftSecondPrize);
    const thirdPaise = toPaise(draftThirdPrize);

    if (
      enteredFeePaise === null ||
      firstPaise === null ||
      secondPaise === null ||
      thirdPaise === null
    ) {
      setOrganizerError('Enter valid non-negative amounts with at most two decimal places.');
      return;
    }

    const entryFeePaise = draftEntryType === 'PAID' ? enteredFeePaise : 0;
    const hasCashPrize = draftPrizeType === 'CASH' || draftPrizeType === 'MIXED';
    const cashPrizePaise = hasCashPrize
      ? firstPaise + secondPaise + thirdPaise
      : 0;

    if (draftEntryType === 'PAID' && entryFeePaise <= 0) {
      setOrganizerError('Paid entry requires a fee greater than zero.');
      return;
    }

    if (
      hasCashPrize &&
      (!Number.isSafeInteger(cashPrizePaise) || cashPrizePaise <= 0)
    ) {
      setOrganizerError('Cash prize allocations must total more than zero.');
      return;
    }

    try {
      setDraftSaving(true);
      setOrganizerError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/draft`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description,
            metric: draftMetric,
            startAt: draftStartAt.toISOString(),
            endAt: draftEndAt.toISOString(),
            targetDistanceKm,
            maxParticipants,
            entryType: draftEntryType,
            entryFeePaise,
            prizeType: draftPrizeType,
            cashPrizePaise,
            prizeDistribution: {
              first: hasCashPrize ? firstPaise : 0,
              second: hasCashPrize ? secondPaise : 0,
              third: hasCashPrize ? thirdPaise : 0,
            },
          }),
        },
      );
      const data: any = await response.json();

      if (!response.ok) throw new Error(data?.error ?? 'Failed to save draft.');

      await Promise.all([loadCompetition(), loadOrganizerPanel(), loadOrganizerAudit()]);
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setDraftSaving(false);
    }
  }, [
    token, competition, isOrganizer, draftSaving, draftName, draftDescription,
    draftStartAt, draftEndAt, draftMetric, draftTargetDistance,
    draftMaxParticipants, draftEntryType, draftEntryFee, draftPrizeType,
    draftFirstPrize, draftSecondPrize, draftThirdPrize,
    competitionId, loadCompetition, loadOrganizerPanel, loadOrganizerAudit,
  ]);

  const publishOrganizerDraft = useCallback(async () => {
    if (!token || !competition || !isOrganizer || organizerActionLoading) return;
    if (competition.status !== 'DRAFT') return;

    try {
      setOrganizerActionLoading(true);
      setOrganizerError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/publish`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );
      const data: any = await response.json();

      if (!response.ok) throw new Error(data?.error ?? 'Failed to publish draft.');

      await Promise.all([loadCompetition(), loadOrganizerPanel(), loadOrganizerAudit()]);
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Failed to publish draft.');
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    token, competition, isOrganizer, organizerActionLoading, competitionId,
    loadCompetition, loadOrganizerPanel, loadOrganizerAudit,
  ]);



  const loadOrganizerOperations = useCallback(async () => {
    if (!token || !competitionId) return;

    setOperationsLoading(true);
    setOrganizerError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [rewardsResponse, failuresResponse] = await Promise.all([
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/admin/rewards`,
          { headers },
        ),
        fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/admin/notification-failures`,
          { headers },
        ),
      ]);

      const rewardsData: any = await rewardsResponse.json();
      const failuresData: any = await failuresResponse.json();

      if (!rewardsResponse.ok) {
        throw new Error(rewardsData?.error ?? 'Could not load reward status.');
      }
      if (!failuresResponse.ok) {
        throw new Error(
          failuresData?.error ?? 'Could not load notification failures.',
        );
      }

      setAdminRewards(Array.isArray(rewardsData?.items) ? rewardsData.items : []);
      setDeliveryFailures(
        Array.isArray(failuresData?.items) ? failuresData.items : [],
      );
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Could not load organizer operations.',
      );
    } finally {
      setOperationsLoading(false);
    }
  }, [competitionId, token]);

  const saveOrganizerReward = useCallback(async () => {
    if (!token || !competitionId || organizerActionLoading) return;

    const participantId = rewardParticipantId.trim();
    const name = rewardName.trim();
    const reason = rewardReason.trim();

    if (!participantId || !name || !reason) {
      setOrganizerError('Participant ID, reward name, and reason are required.');
      return;
    }

    setOrganizerActionLoading(true);
    setOrganizerError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/rewards/${encodeURIComponent(participantId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rewardName: name,
            status: rewardStatus,
            reason,
            notes: rewardNotes.trim(),
          }),
        },
      );

      const data: any = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Could not save reward status.');
      }

      setRewardReason('');
      await loadOrganizerOperations();
      await loadOrganizerAudit();
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Could not save reward status.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    competitionId,
    loadOrganizerAudit,
    loadOrganizerOperations,
    organizerActionLoading,
    rewardName,
    rewardNotes,
    rewardParticipantId,
    rewardReason,
    rewardStatus,
    token,
  ]);

  const resolveOrganizerFlag = useCallback(async (
    activityId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    if (!token || organizerActionLoading) return;

    try {
      setOrganizerActionLoading(true);
      setOrganizerError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/review-flags/${encodeURIComponent(activityId)}/resolve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            resolutionNote: reviewNote.trim() || null,
          }),
        },
      );
      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? `Failed to ${decision.toLowerCase()} activity.`);
      }

      setReviewNote('');
      await Promise.all([loadOrganizerPanel(), loadCompetition()]);
      if (selectedEvidence?.participant?.user_id) {
        await loadParticipantEvidence(String(selectedEvidence.participant.user_id));
      }
    } catch (err) {
      setOrganizerError(
        err instanceof Error ? err.message : 'Failed to resolve review flag.',
      );
    } finally {
      setOrganizerActionLoading(false);
    }
  }, [
    competitionId,
    loadCompetition,
    loadOrganizerPanel,
    loadParticipantEvidence,
    organizerActionLoading,
    reviewNote,
    selectedEvidence,
    token,
  ]);

  const loadSponsoredRewards = useCallback(async () => {
    if (!token || !competitionId || competition?.status !== 'COMPLETED') {
      setSponsoredOffers([]);
      setParticipantSponsoredOffers([]);
      setSponsoredClaims([]);
      return;
    }

    setSponsoredLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const requests: Promise<any>[] = [];

      if (isOrganizer) {
        requests.push(
          fetch(`${API_BASE_URL}/api/competitions/${competitionId}/admin/reward-offers`, { headers })
            .then(async response => {
              const data: any = await response.json();
              if (!response.ok) throw new Error(data?.error ?? 'Could not load organizer reward offers.');
              return { kind: 'admin', data };
            }),
        );
      }

      if (joined) {
        requests.push(
          fetch(`${API_BASE_URL}/api/competitions/${competitionId}/reward-offers`, { headers })
            .then(async response => {
              const data: any = await response.json();
              if (!response.ok) throw new Error(data?.error ?? 'Could not load participant reward offers.');
              return { kind: 'participant', data };
            }),
        );
      }

      const results = await Promise.all(requests);
      for (const result of results) {
        if (result.kind === 'admin') {
          setSponsoredOffers(Array.isArray(result.data?.offers) ? result.data.offers : []);
          setSponsoredClaims(Array.isArray(result.data?.claims) ? result.data.claims : []);
        } else {
          setParticipantSponsoredOffers(Array.isArray(result.data?.offers) ? result.data.offers : []);
        }
      }
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Could not load sponsored rewards.');
    } finally {
      setSponsoredLoading(false);
    }
  }, [competition?.status, competitionId, isOrganizer, joined, token]);

  const createSponsoredReward = useCallback(async () => {
    if (!token || sponsoredActionLoading) return;
    const sponsorName = sponsorNameInput.trim();
    const rewardName = sponsoredRewardNameInput.trim();
    const description = sponsoredDescriptionInput.trim();
    const quantity = Number(sponsoredQuantityInput);
    let claimDeadline: string | null = null;

    if (!sponsorName || !rewardName || !description) {
      setOrganizerError('Enter the sponsor, reward name, and reward description.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      setOrganizerError('Reward quantity must be a whole number from 1 to 100000.');
      return;
    }
    if (sponsoredDeadlineInput.trim()) {
      const parsed = new Date(sponsoredDeadlineInput.trim());
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setOrganizerError('Enter a future claim deadline in ISO format, or leave it blank.');
        return;
      }
      claimDeadline = parsed.toISOString();
    }

    setSponsoredActionLoading(true);
    setOrganizerError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/reward-offers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sponsorName,
            rewardName,
            description,
            quantity,
            eligibilityType: sponsoredEligibilityInput,
            claimDeadline,
            unclaimedPolicy: sponsoredPolicyInput,
          }),
        },
      );
      const data: any = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not create sponsored reward.');

      setSponsorNameInput('');
      setSponsoredRewardNameInput('');
      setSponsoredDescriptionInput('');
      setSponsoredQuantityInput('1');
      setSponsoredDeadlineInput('');
      await loadSponsoredRewards();
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Could not create sponsored reward.');
    } finally {
      setSponsoredActionLoading(false);
    }
  }, [
    competitionId, loadSponsoredRewards, sponsoredActionLoading,
    sponsoredDeadlineInput, sponsoredDescriptionInput, sponsoredEligibilityInput,
    sponsoredPolicyInput, sponsoredQuantityInput, sponsoredRewardNameInput,
    sponsorNameInput, token,
  ]);

  const changeSponsoredOfferStatus = useCallback(async (
    offerId: string,
    status: 'ACTIVE' | 'PAUSED' | 'CLOSED',
  ) => {
    if (!token || sponsoredActionLoading) return;
    const reason = sponsoredOfferReason.trim();
    if (!reason) {
      setOrganizerError('Enter a reason before changing a sponsored offer status.');
      return;
    }
    setSponsoredActionLoading(true);
    setOrganizerError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/reward-offers/${encodeURIComponent(offerId)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, reason }),
        },
      );
      const data: any = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not update reward offer.');
      setSponsoredOfferReason('');
      await loadSponsoredRewards();
      await loadOrganizerAudit();
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Could not update reward offer.');
    } finally {
      setSponsoredActionLoading(false);
    }
  }, [competitionId, loadOrganizerAudit, loadSponsoredRewards, sponsoredActionLoading, sponsoredOfferReason, token]);

  const claimSponsoredReward = useCallback(async (offerId: string) => {
    if (!token || sponsoredActionLoading) return;
    setSponsoredActionLoading(true);
    setOrganizerError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/reward-offers/${encodeURIComponent(offerId)}/claim`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const data: any = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not claim this reward.');
      await loadSponsoredRewards();
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Could not claim this reward.');
    } finally {
      setSponsoredActionLoading(false);
    }
  }, [competitionId, loadSponsoredRewards, sponsoredActionLoading, token]);

  const changeSponsoredClaimStatus = useCallback(async (
    claimId: string,
    status: 'APPROVED' | 'FULFILLED' | 'CANCELLED',
  ) => {
    if (!token || sponsoredActionLoading) return;
    const reason = sponsoredClaimReason.trim();
    if (!reason) {
      setOrganizerError('Enter a reason before updating a participant claim.');
      return;
    }
    setSponsoredActionLoading(true);
    setOrganizerError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competitionId}/admin/reward-claims/${encodeURIComponent(claimId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, reason }),
        },
      );
      const data: any = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not update reward claim.');
      setSponsoredClaimReason('');
      await loadSponsoredRewards();
      await loadOrganizerAudit();
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : 'Could not update reward claim.');
    } finally {
      setSponsoredActionLoading(false);
    }
  }, [competitionId, loadOrganizerAudit, loadSponsoredRewards, sponsoredActionLoading, sponsoredClaimReason, token]);

  useEffect(() => {
    if (competition?.status === 'COMPLETED') loadSponsoredRewards();
  }, [competition?.status, loadSponsoredRewards]);

  useFocusEffect(
    useCallback(() => {
      loadCompetition();
      loadOrganizerPanel();

      const interval = setInterval(() => {
        loadCompetition();
        loadOrganizerPanel();
      }, 30000);

      return () => clearInterval(interval);
    }, [loadCompetition, loadOrganizerPanel]),
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!competition || competition.status !== 'DRAFT') return;

    setDraftName(competition.name ?? '');
    setDraftDescription(competition.description ?? '');
    setDraftMetric(competition.metric);
    setDraftEntryType(competition.entry_type ?? 'FREE');
    setDraftEntryFee(
      competition.entry_type === 'PAID'
        ? (Number(competition.entry_fee_paise || 0) / 100).toFixed(2)
        : '',
    );
    setDraftPrizeType(competition.prize_type ?? 'NONE');
    setDraftFirstPrize(
      (Number(competition.prize_distribution?.first || 0) / 100).toFixed(2),
    );
    setDraftSecondPrize(
      (Number(competition.prize_distribution?.second || 0) / 100).toFixed(2),
    );
    setDraftThirdPrize(
      (Number(competition.prize_distribution?.third || 0) / 100).toFixed(2),
    );

    const start = new Date(competition.start_at);
    const end = new Date(competition.end_at);

    if (!Number.isNaN(start.getTime())) setDraftStartAt(start);
    if (!Number.isNaN(end.getTime())) setDraftEndAt(end);

    setDraftTargetDistance(
      competition.target_distance_km == null
        ? ''
        : String(competition.target_distance_km),
    );
  }, [
    competition?.id,
    competition?.status,
    competition?.name,
    competition?.description,
    competition?.metric,
    competition?.entry_type,
    competition?.entry_fee_paise,
    competition?.prize_type,
    competition?.prize_distribution,
    competition?.start_at,
    competition?.end_at,
    competition?.target_distance_km,
  ]);

  useEffect(() => {
    let active = true;

    const loadOfficialResults = async () => {
      if (competition?.status !== 'COMPLETED') {
        setOfficialResults([]);
        setResultsError(null);
        setResultsLoading(false);
        return;
      }

      setResultsLoading(true);
      setResultsError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/competitions/${competitionId}/results`,
        );
        const data: any = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ?? 'Official results are not available.',
          );
        }

        if (active) {
          setOfficialResults(
            Array.isArray(data?.results) ? data.results : [],
          );
        }
      } catch (err) {
        if (active) {
          setResultsError(
            err instanceof Error
              ? err.message
              : 'Failed to load official results.',
          );
        }
      } finally {
        if (active) setResultsLoading(false);
      }
    };

    loadOfficialResults();

    return () => {
      active = false;
    };
  }, [competition?.status, competitionId]);

  const toggleJoin = async () => {
    if (!userId || !competition || actionLoading) return;

    if (competition.status !== 'REGISTRATION_OPEN') return;

    try {
      setActionLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/competitions/${competition.id}/join/${userId}`,
        {
          method: joined ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? 'Failed to update competition membership.',
        );
      }

      await loadCompetition();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update competition membership.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (days > 0) {
      return `${days}d ${String(hours).padStart(2, '0')}h ${String(
        minutes,
      ).padStart(2, '0')}m`;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0',
    )}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const getRemaining = () => {
    if (!competition) return null;

    const start = new Date(competition.start_at).getTime();
    const end = new Date(competition.end_at).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { label: 'SCHEDULE', value: 'Awaiting dates' };
    }

    if (now < start) {
      return {
        label: 'STARTS IN',
        value: formatDuration(start - now),
      };
    }

    if (now >= end) {
      return { label: 'CHALLENGE ENDED', value: '00:00:00' };
    }

    return {
      label: 'TIME REMAINING',
      value: formatDuration(end - now),
    };
  };

  const formatScore = (score: number) => {
    const value = Number(score);

    if (!Number.isFinite(value)) return '0';

    if (competition?.metric === 'DISTANCE') {
      return `${value.toFixed(2)} km`;
    }

    if (competition?.metric === 'TERRITORY') {
      return `${value.toFixed(3)} km²`;
    }

    return String(Math.round(value));
  };

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) return 'Not scheduled';

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isEnded = ['UNDER_REVIEW', 'COMPLETED', 'CANCELLED', 'ENDED'].includes(
    competition?.status ?? '',
  );
  const canChangeMembership = competition?.status === 'REGISTRATION_OPEN';
  const remaining = getRemaining();
  const currentUser = leaderboard.find(
    item => item.user_id === userId,
  );

  const statusColor =
    competition?.status === 'ACTIVE'
      ? COLORS.accent
      : ['UNDER_REVIEW', 'COMPLETED', 'CANCELLED', 'ENDED'].includes(
          competition?.status ?? '',
        )
        ? COLORS.danger
        : competition?.status === 'REGISTRATION_OPEN'
          ? COLORS.success
          : COLORS.textSecondary;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>
          Loading competition...
        </Text>
      </View>
    );
  }

  if (!competition) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>!</Text>
        </View>

        <Text style={styles.emptyTitle}>
          Competition unavailable
        </Text>

        <Text style={styles.emptyDescription}>
          {error ?? 'This competition could not be found.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            loadCompetition();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.retryButtonText}>TRY AGAIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leaderboard}
        keyExtractor={item => item.user_id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadCompetition();
            }}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        ListHeaderComponent={
          <View>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.eyebrowRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusColor },
                    ]}
                  />

                  <Text style={styles.eyebrow}>
                    COMMUNITY CHALLENGE
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { borderColor: statusColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusColor },
                    ]}
                  >
                    {competition.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroName}>
                {competition.name}
              </Text>

              <Text style={styles.heroDescription}>
                {competition.description?.trim() ||
                  'No description available for this challenge.'}
              </Text>

              {/* Entry fee and prize configuration */}
              <View
                style={{
                  marginTop: SPACING.lg,
                  padding: SPACING.md,
                  borderRadius: 16,
                  backgroundColor: COLORS.surfaceHighlight,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text
                  style={[
                    styles.dateLabel,
                    { marginBottom: SPACING.md },
                  ]}
                >
                  ENTRY & REWARDS
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={styles.dateLabel}>ENTRY</Text>
                  <Text
                    style={[
                      styles.dateValue,
                      { marginTop: 0 },
                    ]}
                  >
                    {competition.entry_type === 'PAID'
                      ? `₹${(Number(competition.entry_fee_paise || 0) / 100).toFixed(2)}`
                      : 'FREE'}
                  </Text>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: COLORS.border,
                    marginVertical: SPACING.md,
                  }}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={styles.dateLabel}>PRIZE TYPE</Text>
                  <Text
                    style={[
                      styles.dateValue,
                      { marginTop: 0 },
                    ]}
                  >
                    {{
                      NONE: 'No prize',
                      CASH: 'Cash prize',
                      SPONSORED: 'Sponsored rewards',
                      MIXED: 'Cash + sponsored',
                    }[competition.prize_type || 'NONE']}
                  </Text>
                </View>

                {(competition.prize_type === 'CASH' ||
                  competition.prize_type === 'MIXED') && (
                  <View style={{ marginTop: SPACING.md }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={styles.dateLabel}>TOTAL CASH PRIZE</Text>
                      <Text
                        style={[
                          styles.dateValue,
                          { marginTop: 0, color: COLORS.accent },
                        ]}
                      >
                        ₹{(
                          Number(competition.cash_prize_paise || 0) / 100
                        ).toFixed(2)}
                      </Text>
                    </View>

                    {([
                      ['1st Place', competition.prize_distribution?.first],
                      ['2nd Place', competition.prize_distribution?.second],
                      ['3rd Place', competition.prize_distribution?.third],
                    ] as const).some(([, amount]) => Number(amount || 0) > 0) && (
                      <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
                        {([
                          ['1st Place', competition.prize_distribution?.first],
                          ['2nd Place', competition.prize_distribution?.second],
                          ['3rd Place', competition.prize_distribution?.third],
                        ] as const).map(([label, amount]) => (
                          <View
                            key={label}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={styles.heroDescription}>
                              {label}
                            </Text>
                            <Text style={styles.dateValue}>
                              ₹{(Number(amount || 0) / 100).toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {(competition.prize_type === 'SPONSORED' ||
                  competition.prize_type === 'MIXED') && (
                  <Text
                    style={[
                      styles.heroDescription,
                      { marginTop: SPACING.md },
                    ]}
                  >
                    Sponsored rewards are managed separately through the
                    existing sponsored rewards system.
                  </Text>
                )}

                {(competition.entry_type === 'PAID' ||
                  Number(competition.cash_prize_paise || 0) > 0) && (
                  <View
                    style={{
                      marginTop: SPACING.md,
                      padding: SPACING.sm,
                      borderRadius: 10,
                      backgroundColor: 'rgba(255, 170, 0, 0.08)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 170, 0, 0.35)',
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFB84D',
                        fontSize: 11,
                        lineHeight: 17,
                        fontWeight: '600',
                      }}
                    >
                      Payment and cash payout features are not active yet.
                      This challenge must remain a draft until those systems
                      are implemented.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroDates}>
                <View style={styles.dateBlock}>
                  <Text style={styles.dateLabel}>START DATE</Text>
                  <Text style={styles.dateValue}>
                    {formatDate(competition.start_at)}
                  </Text>
                </View>

                <View style={styles.dateDivider} />

                <View style={styles.dateBlock}>
                  <Text style={styles.dateLabel}>END DATE</Text>
                  <Text style={styles.dateValue}>
                    {formatDate(competition.end_at)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: SPACING.md }}>
                <Text style={styles.dateLabel}>REGISTRATION CLOSES</Text>
                <Text style={styles.dateValue}>
                  {formatDate(
                    competition.registration_closes_at ?? competition.start_at,
                  )}
                </Text>
                <Text style={[styles.heroDescription, { marginTop: SPACING.sm }]}>
                  {competition.metric === 'DISTANCE'
                    ? 'Scoring: total eligible distance in kilometres.'
                    : competition.metric === 'TERRITORY'
                      ? 'Scoring: total eligible territory captured in square kilometres.'
                      : 'Scoring: number of eligible completed activities.'}
                </Text>
                <Text style={[styles.heroDescription, { marginTop: SPACING.xs }]}>
                  Eligibility: only your own eligible activities within the challenge
                  start and end window count. Registration closes when the challenge starts.
                </Text>
                {competition.max_participants != null && (
                  <Text style={[styles.heroDescription, { marginTop: SPACING.xs }]}>
                    Participant limit: {competition.max_participants}
                  </Text>
                )}
              </View>
            </View>

            {/* Countdown — only for published challenges */}
            {!['DRAFT', 'CANCELLED'].includes(competition.status) && (
              <View style={styles.timerCard}>
                <View style={styles.timerTop}>
                  <View style={styles.timerIndicator} />
                  <Text style={styles.timerLabel}>{remaining?.label}</Text>
                </View>

                <Text
                  style={[
                    styles.timerValue,
                    remaining?.value === 'Awaiting dates' && styles.timerValueSmall,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {remaining?.value}
                </Text>

                <Text style={styles.timerCaption}>
                  {competition.status === 'ACTIVE'
                    ? 'Every effort counts. Keep moving.'
                    : competition.status === 'COMPLETED' ||
                        competition.status === 'UNDER_REVIEW'
                      ? 'This challenge has ended.'
                      : 'Get ready for the challenge.'}
                </Text>
              </View>
            )}

            {/* Personal ranking */}
            {joined &&
              currentUser &&
              !['DRAFT', 'CANCELLED'].includes(competition.status) && (
              <View style={styles.youCard}>
                <View style={styles.youCardTop}>
                  <Text style={styles.youEyebrow}>
                    YOUR PERFORMANCE
                  </Text>
                  <Text style={styles.youBadge}>YOU</Text>
                </View>

                <View style={styles.youStats}>
                  <View style={styles.youStat}>
                    <Text style={styles.youLabel}>YOUR RANK</Text>
                    <Text style={styles.youRank}>
                      #{currentUser.rank}
                    </Text>
                  </View>

                  <View style={styles.youDivider} />

                  <View style={styles.youStat}>
                    <Text style={styles.youLabel}>YOUR SCORE</Text>
                    <Text
                      style={styles.youScore}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatScore(Number(currentUser.score))}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Join / leave */}
            {canChangeMembership && !isEnded && (
              <TouchableOpacity
                style={[
                  styles.joinButton,
                  joined && styles.leaveButton,
                ]}
                onPress={toggleJoin}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator
                    color={
                      joined ? COLORS.danger : COLORS.background
                    }
                  />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.joinButtonText,
                        joined && styles.leaveButtonText,
                      ]}
                    >
                      {joined
                        ? 'LEAVE CHALLENGE'
                        : 'JOIN CHALLENGE'}
                    </Text>

                    <Text
                      style={[
                        styles.joinButtonArrow,
                        joined && styles.leaveButtonText,
                      ]}
                    >
                      {joined ? '−' : '↗'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>
                  Action unsuccessful
                </Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>◎</Text>
                <Text style={styles.statValue}>
                  {competition.participants_count ?? leaderboard.length}
                </Text>
                <Text style={styles.statLabel}>PARTICIPANTS</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statIcon}>↗</Text>
                <Text style={styles.statValue}>
                  {competition.metric === 'DISTANCE'
                    ? 'KM'
                    : competition.metric === 'TERRITORY'
                      ? 'KM²'
                      : 'COUNT'}
                </Text>
                <Text style={styles.statLabel}>SCORING UNIT</Text>
              </View>
            </View>

            {/* Participant progress */}
            {joined &&
              progress &&
              ['ACTIVE', 'UNDER_REVIEW', 'COMPLETED'].includes(competition.status) && (
              <View
                style={{
                  backgroundColor: COLORS.surface,
                  borderColor: COLORS.border,
                  borderWidth: 1,
                  borderRadius: 18,
                  padding: SPACING.md,
                  marginBottom: SPACING.lg,
                }}
              >
                <Text
                  style={{
                    ...TYPOGRAPHY.label,
                    color: COLORS.textSecondary,
                    marginBottom: SPACING.md,
                  }}
                >
                  YOUR CHALLENGE PROGRESS
                </Text>

                <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary }}>
                      YOUR RANK
                    </Text>
                    <Text style={{ ...TYPOGRAPHY.hero, fontSize: 25 }}>
                      {progress.rank == null ? '—' : `#${progress.rank}`}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary }}>
                      YOUR SCORE
                    </Text>
                    <Text
                      style={{ ...TYPOGRAPHY.hero, fontSize: 25 }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {Number(progress.total_score).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    marginTop: SPACING.md,
                    paddingTop: SPACING.md,
                  }}
                >
                  <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary }}>
                    ACTIVITIES AWAITING REVIEW
                  </Text>
                  <Text style={{ ...TYPOGRAPHY.body, marginTop: 4 }}>
                    {progress.review_count}
                  </Text>
                </View>

                {progress.breakdown?.map(item => (
                  <View
                    key={item.metric}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: SPACING.sm,
                    }}
                  >
                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary }}>
                      {item.metric}
                    </Text>
                    <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.text }}>
                      {Number(item.score).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      · {item.scoredActivities} scored
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {competition.status === 'COMPLETED' && (
              <View
                style={{
                  backgroundColor: COLORS.surface,
                  borderColor: COLORS.accent,
                  borderWidth: 1,
                  borderRadius: 18,
                  padding: SPACING.md,
                  marginBottom: SPACING.lg,
                }}
              >
                <Text
                  style={{
                    color: COLORS.accent,
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 1,
                  }}
                >
                  OFFICIAL RESULTS
                </Text>
                <Text
                  style={{
                    color: COLORS.text,
                    fontSize: 22,
                    fontWeight: '900',
                    marginTop: 6,
                  }}
                >
                  Final rankings
                </Text>

                {resultsLoading ? (
                  <ActivityIndicator
                    color={COLORS.accent}
                    style={{ marginVertical: SPACING.md }}
                  />
                ) : resultsError ? (
                  <Text
                    style={{
                      color: COLORS.danger,
                      fontSize: 12,
                      marginTop: SPACING.sm,
                    }}
                  >
                    {resultsError}
                  </Text>
                ) : officialResults.length === 0 ? (
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 12,
                      marginTop: SPACING.sm,
                    }}
                  >
                    Official results have not been published yet.
                  </Text>
                ) : (
                  officialResults.map(result => (
                    <View
                      key={result.user_id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 11,
                        borderBottomWidth: 1,
                        borderBottomColor: COLORS.border,
                      }}
                    >
                      <Text
                        style={{
                          width: 42,
                          color: result.rank_position <= 3
                            ? COLORS.accent
                            : COLORS.textSecondary,
                          fontSize: 15,
                          fontWeight: '900',
                        }}
                      >
                        #{result.rank_position}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: COLORS.text,
                            fontSize: 12,
                            fontWeight: '800',
                          }}
                        >
                          {result.display_name?.trim() || result.username || 'Runner'}
                          {result.user_id === userId ? ' (You)' : ''}
                        </Text>
                        {(result.badges ?? []).length > 0 && (
                          <View
                            style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              marginTop: 5,
                              gap: 5,
                            }}
                          >
                            {result.badges!.map(badge => (
                              <View
                                key={`${result.user_id}-${badge.code}`}
                                style={{
                                  backgroundColor: COLORS.surfaceHighlight,
                                  borderWidth: 1,
                                  borderColor: COLORS.border,
                                  borderRadius: 12,
                                  paddingHorizontal: 7,
                                  paddingVertical: 3,
                                }}
                              >
                                <Text
                                  style={{
                                    color: COLORS.textSecondary,
                                    fontSize: 9,
                                    fontWeight: '600',
                                  }}
                                >
                                  {badge.icon} {badge.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <Text
                        style={{
                          color: COLORS.accent,
                          fontSize: 12,
                          fontWeight: '900',
                          marginLeft: SPACING.sm,
                        }}
                      >
                        {formatScore(Number(result.score))}
                      </Text>
                    </View>
                  ))
                )}

                {officialResults.length > 0 && (
                  <Text
                    style={{
                      color: COLORS.textMuted,
                      fontSize: 10,
                      marginTop: SPACING.sm,
                    }}
                  >
                    Published: {new Date(
                      officialResults[0].finalized_at,
                    ).toLocaleDateString('en-IN')}
                  </Text>
                )}

              </View>
            )}

            {/* Organizer review tools */}
             {isOrganizer && competition.status !== 'CANCELLED' && (
               <View style={{
                 backgroundColor: COLORS.surface,
                 borderColor: COLORS.border,
                 borderWidth: 1,
                 borderRadius: 18,
                 padding: SPACING.md,
                 marginBottom: SPACING.lg,
               }}>
                {competition.status !== 'DRAFT' && (
                  <>
                 <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>
                   ORGANIZER CONSOLE
                 </Text>
                 <Text style={{ ...TYPOGRAPHY.h2, fontSize: 21, marginTop: 6 }}>
                   Participant review
                 </Text>
                 <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 5 }}>
                   Review participant scores and flagged activities before finalizing results.
                 </Text>

                 {/* Challenge lifecycle controls */}
                 <View
                   style={{
                     borderTopWidth: 1,
                     borderTopColor: COLORS.border,
                     marginTop: SPACING.md,
                     paddingTop: SPACING.md,
                   }}
                 >
                   <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textSecondary }}>
                     CHALLENGE FINALIZATION
                   </Text>

                   {competition.status === 'ACTIVE' && (
                     <>
                       <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 6 }}>
                         {Date.now() < new Date(competition.end_at).getTime()
                           ? 'Review becomes available after the challenge end time.'
                           : 'The challenge has ended. Start the review process to verify participant scores.'}
                       </Text>

                       <TouchableOpacity
                         onPress={startOrganizerReview}
                         disabled={
                           organizerActionLoading ||
                           Date.now() < new Date(competition.end_at).getTime()
                         }
                         style={{
                           alignItems: 'center',
                           paddingVertical: 13,
                           borderRadius: 10,
                           marginTop: SPACING.sm,
                           backgroundColor:
                             Date.now() >= new Date(competition.end_at).getTime()
                               ? COLORS.accent
                               : COLORS.surfaceHighlight,
                           opacity: organizerActionLoading ? 0.55 : 1,
                         }}
                       >
                         <Text
                           style={{
                             color:
                               Date.now() >= new Date(competition.end_at).getTime()
                                 ? COLORS.background
                                 : COLORS.textMuted,
                             fontSize: 11,
                             fontWeight: '900',
                           }}
                         >
                           {organizerActionLoading ? 'PLEASE WAIT…' : 'START CHALLENGE REVIEW'}
                         </Text>
                       </TouchableOpacity>
                     </>
                   )}

                   {competition.status === 'UNDER_REVIEW' && (
                     <>
                       <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 8 }}>
                         Unresolved flags: {organizerFlags.length}
                       </Text>

                       <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 4 }}>
                         {organizerFlags.length > 0
                           ? 'Resolve every outstanding review flag before publishing official results.'
                           : 'All review flags are resolved. The challenge is ready for finalization.'}
                       </Text>

                       <TouchableOpacity
                         onPress={finalizeOrganizerCompetition}
                         disabled={organizerActionLoading || organizerFlags.length > 0}
                         style={{
                           alignItems: 'center',
                           paddingVertical: 13,
                           borderRadius: 10,
                           marginTop: SPACING.sm,
                           backgroundColor:
                             organizerFlags.length === 0
                               ? COLORS.accent
                               : COLORS.surfaceHighlight,
                           opacity: organizerActionLoading ? 0.55 : 1,
                         }}
                       >
                         <Text
                           style={{
                             color:
                               organizerFlags.length === 0
                                 ? COLORS.background
                                 : COLORS.textMuted,
                             fontSize: 11,
                             fontWeight: '900',
                           }}
                         >
                           {organizerActionLoading
                             ? 'FINALIZING…'
                             : 'PUBLISH OFFICIAL RESULTS'}
                         </Text>
                       </TouchableOpacity>
                     </>
                   )}

                   {competition.status === 'COMPLETED' && (
                     <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.success, marginTop: 8 }}>
                       Official results have been published.
                     </Text>
                   )}
                 </View>

                 {organizerLoading && <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />}
                 {organizerError && (
                   <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: SPACING.sm }}>
                     {organizerError}
                   </Text>
                 )}

                 <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textSecondary, marginTop: SPACING.lg, marginBottom: SPACING.sm }}>
                   PARTICIPANTS ({organizerParticipants.length})
                 </Text>

                 {organizerParticipants.length === 0 && !organizerLoading ? (
                   <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted }}>No participants found.</Text>
                 ) : organizerParticipants.map(participant => (
                   <TouchableOpacity
                     key={participant.user_id}
                     onPress={() => loadParticipantEvidence(participant.user_id)}
                     activeOpacity={0.8}
                     style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border }}
                   >
                     <View style={{ flex: 1, minWidth: 0 }}>
                       <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 12, fontWeight: '800' }}>
                         {participant.display_name?.trim() || participant.username || 'Runner'}
                       </Text>
                       <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 3 }}>
                         @{participant.username || 'runner'} · {participant.unresolved_flags ?? 0} unresolved flag(s)
                       </Text>
                     </View>
                     <View style={{ alignItems: 'flex-end', marginLeft: SPACING.sm }}>
                       <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: '900' }}>
                         {formatScore(Number(participant.total_score))}
                       </Text>
                       <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2 }}>VIEW EVIDENCE</Text>
                     </View>
                   </TouchableOpacity>
                 ))}

                 {evidenceLoadingFor && <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.md }} />}

                 {selectedEvidence && (
                   <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm, paddingTop: SPACING.md }}>
                     <Text style={{ ...TYPOGRAPHY.label, color: COLORS.accent }}>SELECTED PARTICIPANT EVIDENCE</Text>
                     <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '800', marginTop: 6 }}>
                       {selectedEvidence.participant?.display_name || selectedEvidence.participant?.username || selectedEvidence.participant?.user_id || 'Participant'}
                     </Text>
                     {(selectedEvidence.scores ?? []).length === 0 ? (
                       <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.sm }}>
                         No scoring evidence returned for this participant.
                       </Text>
                     ) : (selectedEvidence.scores ?? []).map((score, index) => (
                       <View key={String(score.activity_id ?? score.id ?? index)} style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: SPACING.sm, marginTop: SPACING.xs }}>
                         <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '800' }}>
                           {String(score.activity_title ?? score.title ?? score.activity_type ?? score.activity_id ?? `Activity ${index + 1}`)}
                         </Text>
                         <Text style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: 4 }}>
                           Score: {String(score.score ?? score.total_score ?? '—')} · Status: {String(score.scoring_status ?? score.status ?? score.review_status ?? 'Not specified')}
                         </Text>
                         {!!(score.calculated_at ?? score.created_at) && (
                           <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 3 }}>
                             Submitted: {new Date(String(score.calculated_at ?? score.created_at)).toLocaleString('en-IN')}
                           </Text>
                         )}
                       </View>
                     ))}
                     {(selectedEvidence.flags ?? []).length > 0 && (
                       <Text style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: SPACING.sm }}>
                         This participant has {selectedEvidence.flags?.length} review flag record(s).
                       </Text>
                     )}
                   </View>
                 )}

                 <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textSecondary, marginTop: SPACING.lg, marginBottom: SPACING.sm }}>
                   UNRESOLVED REVIEW FLAGS ({organizerFlags.length})
                 </Text>

                 {organizerFlags.length === 0 ? (
                   <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted }}>No unresolved review flags.</Text>
                 ) : organizerFlags.map((flag, index) => (
                   <View key={`${flag.activity_id}-${flag.user_id}-${index}`} style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md, marginTop: SPACING.sm }}>
                     <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '800' }}>
                       {flag.display_name?.trim() || flag.username || 'Runner'}
                     </Text>
                     <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 4 }}>
                       {flag.reason || 'Activity flagged for review'}
                     </Text>
                     {!!flag.details && (
                       <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 4 }}>{flag.details}</Text>
                     )}
                     <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 4 }}>
                       Activity: {flag.activity_id}{flag.created_at ? ` · ${new Date(flag.created_at).toLocaleString('en-IN')}` : ''}
                     </Text>
                     <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                       <TouchableOpacity
                         onPress={() => resolveOrganizerFlag(flag.activity_id, 'APPROVED')}
                         disabled={organizerActionLoading || competition.status !== 'UNDER_REVIEW' || !reviewNote.trim() || reviewNote.trim().length > 1000}
                         style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: competition.status === 'UNDER_REVIEW' ? COLORS.accent : COLORS.surfaceHighlight, opacity: organizerActionLoading ? 0.55 : 1 }}
                       >
                         <Text style={{ color: competition.status === 'UNDER_REVIEW' ? COLORS.background : COLORS.textMuted, fontSize: 10, fontWeight: '900' }}>APPROVE</Text>
                       </TouchableOpacity>
                       <TouchableOpacity
                         onPress={() => resolveOrganizerFlag(flag.activity_id, 'REJECTED')}
                         disabled={organizerActionLoading || competition.status !== 'UNDER_REVIEW' || !reviewNote.trim() || reviewNote.trim().length > 1000}
                         style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: COLORS.danger, opacity: organizerActionLoading ? 0.55 : 1 }}
                       >
                         <Text style={{ color: COLORS.danger, fontSize: 10, fontWeight: '900' }}>REJECT</Text>
                       </TouchableOpacity>
                     </View>
                   </View>
                 ))}

                 {organizerFlags.length > 0 && (
                   <>
                     <TextInput
                       value={reviewNote}
                       onChangeText={setReviewNote}
                       placeholder="Required review note (1–1000 characters)"
                       placeholderTextColor={COLORS.textMuted}
                       multiline
                       style={{ color: COLORS.text, backgroundColor: COLORS.background, borderColor: COLORS.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, minHeight: 72, marginTop: SPACING.md, textAlignVertical: 'top' }}
                     />
                     <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 5 }}>
                       A review note (1–1000 characters) is required. Approval uses the server-calculated score; rejection assigns zero. Decisions are enabled only while the competition is under review.
                     </Text>
                   </>
                 )}

                 {/* Phase 7: documented score correction */}
                 <View style={{
                   borderTopWidth: 1,
                   borderTopColor: COLORS.border,
                   marginTop: SPACING.lg,
                   paddingTop: SPACING.md,
                 }}>
                   <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textSecondary }}>
                     SCORE CORRECTION
                   </Text>
                   <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 4 }}>
                     Available only during review, for activities already marked SCORED.
                   </Text>

                   <TextInput
                     value={correctionActivityId}
                     onChangeText={setCorrectionActivityId}
                     placeholder="Activity ID"
                     placeholderTextColor={COLORS.textMuted}
                     autoCapitalize="none"
                     style={{
                       color: COLORS.text,
                       backgroundColor: COLORS.background,
                       borderColor: COLORS.border,
                       borderWidth: 1,
                       borderRadius: 10,
                       paddingHorizontal: SPACING.md,
                       paddingVertical: SPACING.sm,
                       marginTop: SPACING.sm,
                     }}
                   />
                   <TextInput
                     value={correctionScore}
                     onChangeText={setCorrectionScore}
                     placeholder="Corrected score"
                     placeholderTextColor={COLORS.textMuted}
                     keyboardType="decimal-pad"
                     style={{
                       color: COLORS.text,
                       backgroundColor: COLORS.background,
                       borderColor: COLORS.border,
                       borderWidth: 1,
                       borderRadius: 10,
                       paddingHorizontal: SPACING.md,
                       paddingVertical: SPACING.sm,
                       marginTop: SPACING.sm,
                     }}
                   />
                   <TextInput
                     value={correctionReason}
                     onChangeText={setCorrectionReason}
                     placeholder="Required reason for correction"
                     placeholderTextColor={COLORS.textMuted}
                     multiline
                     maxLength={1000}
                     style={{
                       color: COLORS.text,
                       backgroundColor: COLORS.background,
                       borderColor: COLORS.border,
                       borderWidth: 1,
                       borderRadius: 10,
                       paddingHorizontal: SPACING.md,
                       paddingVertical: SPACING.sm,
                       minHeight: 64,
                       marginTop: SPACING.sm,
                       textAlignVertical: 'top',
                     }}
                   />
                   <TouchableOpacity
                     onPress={correctOrganizerScore}
                     disabled={
                       organizerActionLoading ||
                       competition.status !== 'UNDER_REVIEW'
                     }
                     style={{
                       alignItems: 'center',
                       paddingVertical: 12,
                       borderRadius: 10,
                       marginTop: SPACING.sm,
                       backgroundColor:
                         competition.status === 'UNDER_REVIEW'
                           ? COLORS.accent
                           : COLORS.surfaceHighlight,
                       opacity: organizerActionLoading ? 0.55 : 1,
                     }}
                   >
                     <Text style={{
                       color: competition.status === 'UNDER_REVIEW'
                         ? COLORS.background
                         : COLORS.textMuted,
                       fontSize: 11,
                       fontWeight: '900',
                     }}>
                       APPLY SCORE CORRECTION
                     </Text>
                   </TouchableOpacity>
                 </View>

                 {/* Phase 7: audit history */}
                 <View style={{
                   borderTopWidth: 1,
                   borderTopColor: COLORS.border,
                   marginTop: SPACING.lg,
                   paddingTop: SPACING.md,
                 }}>
                   <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textSecondary }}>
                     ORGANIZER AUDIT HISTORY
                   </Text>
                   <TouchableOpacity
                     onPress={loadOrganizerAudit}
                     disabled={organizerAuditLoading}
                     style={{
                       alignItems: 'center',
                       paddingVertical: 11,
                       borderRadius: 10,
                       marginTop: SPACING.sm,
                       borderWidth: 1,
                       borderColor: COLORS.border,
                     }}
                   >
                     <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '900' }}>
                       {organizerAuditLoading ? 'LOADING AUDIT…' : 'LOAD RECENT ACTIONS'}
                     </Text>
                   </TouchableOpacity>

                   {organizerAudit.length === 0 && !organizerAuditLoading ? (
                     <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.sm }}>
                       No audit entries loaded. Select Load Recent Actions to retrieve history.
                     </Text>
                   ) : organizerAudit.map((entry, index) => (
                     <View
                       key={String(entry.id ?? `${entry.action_type}-${index}`)}
                       style={{
                         borderTopWidth: 1,
                         borderTopColor: COLORS.border,
                         paddingVertical: SPACING.sm,
                         marginTop: SPACING.xs,
                       }}
                     >
                       <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '800' }}>
                         {String(entry.action_type ?? 'Organizer action')}
                       </Text>
                       {!!entry.reason && (
                         <Text style={{ color: COLORS.textSecondary, fontSize: 10, marginTop: 3 }}>
                           {String(entry.reason)}
                         </Text>
                       )}
                       <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 3 }}>
                         {entry.created_at
                           ? new Date(String(entry.created_at)).toLocaleString('en-IN')
                           : 'Timestamp unavailable'}
                         {entry.activity_id ? ` · Activity ${entry.activity_id}` : ''}
                       </Text>
                     </View>
                   ))}
                 </View>

                  </>
                )}

                  {/* PHASE7_DRAFT_EDIT_PUBLISH */}
                  {competition.status === 'DRAFT' && (
                    <View style={{
                      borderTopWidth: 1,
                      borderTopColor: COLORS.border,
                      marginTop: SPACING.lg,
                      paddingTop: SPACING.md,
                    }}>
                      <Text style={{ ...TYPOGRAPHY.label, color: COLORS.accent }}>
                        EDIT COMPETITION DRAFT
                      </Text>

                      <TextInput
                        value={draftName}
                        onChangeText={setDraftName}
                        maxLength={120}
                        placeholder="Competition name"
                        placeholderTextColor={COLORS.textMuted}
                        style={{
                          color: COLORS.text,
                          backgroundColor: COLORS.background,
                          borderColor: COLORS.border,
                          borderWidth: 1,
                          borderRadius: 10,
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm,
                          marginTop: SPACING.sm,
                        }}
                      />

                      <TextInput
                        value={draftDescription}
                        onChangeText={setDraftDescription}
                        maxLength={500}
                        multiline
                        placeholder="Description"
                        placeholderTextColor={COLORS.textMuted}
                        style={{
                          color: COLORS.text,
                          backgroundColor: COLORS.background,
                          borderColor: COLORS.border,
                          borderWidth: 1,
                          borderRadius: 10,
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm,
                          minHeight: 72,
                          marginTop: SPACING.sm,
                          textAlignVertical: 'top',
                        }}
                      />

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.sm,
                      }}>
                        Scoring metric
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        {(['DISTANCE', 'TERRITORY', 'ACTIVITIES'] as Metric[]).map(value => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => setDraftMetric(value)}
                            style={{
                              flex: 1,
                              paddingVertical: 10,
                              borderRadius: 9,
                              alignItems: 'center',
                              backgroundColor: draftMetric === value ? COLORS.accent : COLORS.surface,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                            }}
                          >
                            <Text style={{
                              color: draftMetric === value ? COLORS.background : COLORS.text,
                              fontSize: 9,
                              fontWeight: '900',
                            }}>
                              {value}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.md,
                      }}>
                        Entry type
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        {(['FREE', 'PAID'] as const).map(value => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => setDraftEntryType(value)}
                            style={{
                              flex: 1,
                              paddingVertical: 11,
                              borderRadius: 9,
                              alignItems: 'center',
                              backgroundColor: draftEntryType === value ? COLORS.accent : COLORS.surface,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                            }}
                          >
                            <Text style={{
                              color: draftEntryType === value ? COLORS.background : COLORS.text,
                              fontSize: 10,
                              fontWeight: '900',
                            }}>
                              {value}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {draftEntryType === 'PAID' && (
                        <>
                          <TextInput
                            value={draftEntryFee}
                            onChangeText={setDraftEntryFee}
                            keyboardType="decimal-pad"
                            placeholder="Entry fee in ₹"
                            placeholderTextColor={COLORS.textMuted}
                            style={{
                              color: COLORS.text,
                              backgroundColor: COLORS.background,
                              borderColor: COLORS.border,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: SPACING.md,
                              paddingVertical: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          />
                          <Text style={{ ...TYPOGRAPHY.caption, color: '#FFB84D', marginTop: 5 }}>
                            Payment collection is not active. Paid challenges cannot be published.
                          </Text>
                        </>
                      )}

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.md,
                      }}>
                        Prize type
                      </Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                        {(['NONE', 'CASH', 'SPONSORED', 'MIXED'] as const).map(value => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => setDraftPrizeType(value)}
                            style={{
                              minWidth: '47%',
                              flexGrow: 1,
                              paddingVertical: 11,
                              paddingHorizontal: 8,
                              borderRadius: 9,
                              alignItems: 'center',
                              backgroundColor: draftPrizeType === value ? COLORS.accent : COLORS.surface,
                              borderWidth: 1,
                              borderColor: COLORS.border,
                            }}
                          >
                            <Text style={{
                              color: draftPrizeType === value ? COLORS.background : COLORS.text,
                              fontSize: 9,
                              fontWeight: '900',
                            }}>
                              {value}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {(draftPrizeType === 'CASH' || draftPrizeType === 'MIXED') && (
                        <>
                          <TextInput
                            value={draftFirstPrize}
                            onChangeText={setDraftFirstPrize}
                            keyboardType="decimal-pad"
                            placeholder="1st place cash prize (₹)"
                            placeholderTextColor={COLORS.textMuted}
                            style={{
                              color: COLORS.text,
                              backgroundColor: COLORS.background,
                              borderColor: COLORS.border,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: SPACING.md,
                              paddingVertical: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          />
                          <TextInput
                            value={draftSecondPrize}
                            onChangeText={setDraftSecondPrize}
                            keyboardType="decimal-pad"
                            placeholder="2nd place cash prize (₹)"
                            placeholderTextColor={COLORS.textMuted}
                            style={{
                              color: COLORS.text,
                              backgroundColor: COLORS.background,
                              borderColor: COLORS.border,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: SPACING.md,
                              paddingVertical: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          />
                          <TextInput
                            value={draftThirdPrize}
                            onChangeText={setDraftThirdPrize}
                            keyboardType="decimal-pad"
                            placeholder="3rd place cash prize (₹)"
                            placeholderTextColor={COLORS.textMuted}
                            style={{
                              color: COLORS.text,
                              backgroundColor: COLORS.background,
                              borderColor: COLORS.border,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: SPACING.md,
                              paddingVertical: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          />
                          <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 5 }}>
                            Total cash prize: ₹{(
                              (Number(draftFirstPrize || 0) +
                                Number(draftSecondPrize || 0) +
                                Number(draftThirdPrize || 0))
                            ).toFixed(2)}
                          </Text>
                          <Text style={{ ...TYPOGRAPHY.caption, color: '#FFB84D', marginTop: 4 }}>
                            Cash payouts are not active. Cash-prize challenges cannot be published.
                          </Text>
                        </>
                      )}

                      {(draftPrizeType === 'SPONSORED' || draftPrizeType === 'MIXED') && (
                        <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: SPACING.sm }}>
                          Sponsored offers continue to be managed through the existing sponsored rewards workflow.
                        </Text>
                      )}

                      {draftMetric === 'DISTANCE' && (
                        <>
                          <Text style={{
                            ...TYPOGRAPHY.caption,
                            color: COLORS.textSecondary,
                            marginTop: SPACING.md,
                          }}>
                            Target distance (km)
                          </Text>
                          <TextInput
                            value={draftTargetDistance}
                            onChangeText={setDraftTargetDistance}
                            keyboardType="decimal-pad"
                            placeholder="e.g. 50"
                            placeholderTextColor={COLORS.textMuted}
                            style={{
                              color: COLORS.text,
                              backgroundColor: COLORS.background,
                              borderColor: COLORS.border,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: SPACING.md,
                              paddingVertical: SPACING.sm,
                              marginTop: SPACING.sm,
                            }}
                          />
                        </>
                      )}

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.md,
                      }}>
                        Maximum participants (optional)
                      </Text>
                      <TextInput
                        value={draftMaxParticipants}
                        onChangeText={setDraftMaxParticipants}
                        keyboardType="number-pad"
                        placeholder="Leave blank for unlimited"
                        placeholderTextColor={COLORS.textMuted}
                        style={{
                          color: COLORS.text,
                          backgroundColor: COLORS.background,
                          borderColor: COLORS.border,
                          borderWidth: 1,
                          borderRadius: 10,
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm,
                          marginTop: SPACING.sm,
                        }}
                      />
                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: 5,
                      }}>
                        Includes the creator. Maximum 100000 participants.
                      </Text>

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.md,
                      }}>
                        Challenge start
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => setActiveDraftPicker('startDate')}
                          style={{
                            flex: 1,
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            backgroundColor: COLORS.background,
                          }}
                        >
                          <Text style={{ color: COLORS.textSecondary, fontSize: 10 }}>
                            START DATE
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 5 }}>
                            {draftStartAt.toLocaleDateString()}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setActiveDraftPicker('startTime')}
                          style={{
                            flex: 1,
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            backgroundColor: COLORS.background,
                          }}
                        >
                          <Text style={{ color: COLORS.textSecondary, fontSize: 10 }}>
                            START TIME
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 5 }}>
                            {draftStartAt.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textSecondary,
                        marginTop: SPACING.md,
                      }}>
                        Challenge end
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => setActiveDraftPicker('endDate')}
                          style={{
                            flex: 1,
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            backgroundColor: COLORS.background,
                          }}
                        >
                          <Text style={{ color: COLORS.textSecondary, fontSize: 10 }}>
                            END DATE
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 5 }}>
                            {draftEndAt.toLocaleDateString()}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setActiveDraftPicker('endTime')}
                          style={{
                            flex: 1,
                            padding: 12,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            backgroundColor: COLORS.background,
                          }}
                        >
                          <Text style={{ color: COLORS.textSecondary, fontSize: 10 }}>
                            END TIME
                          </Text>
                          <Text style={{ color: COLORS.text, marginTop: 5 }}>
                            {draftEndAt.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {activeDraftPicker !== null && (
                        <DateTimePicker
                          value={
                            activeDraftPicker.startsWith('start')
                              ? draftStartAt
                              : draftEndAt
                          }
                          mode={
                            activeDraftPicker.endsWith('Date') ? 'date' : 'time'
                          }
                          display="default"
                          onChange={(_event, selectedDate) => {
                            if (selectedDate) {
                              if (activeDraftPicker.startsWith('start')) {
                                setDraftStartAt(previous => {
                                  const next = new Date(previous);
                                  if (activeDraftPicker === 'startDate') {
                                    next.setFullYear(
                                      selectedDate.getFullYear(),
                                      selectedDate.getMonth(),
                                      selectedDate.getDate(),
                                    );
                                  } else {
                                    next.setHours(
                                      selectedDate.getHours(),
                                      selectedDate.getMinutes(),
                                      0,
                                      0,
                                    );
                                  }
                                  return next;
                                });
                              } else {
                                setDraftEndAt(previous => {
                                  const next = new Date(previous);
                                  if (activeDraftPicker === 'endDate') {
                                    next.setFullYear(
                                      selectedDate.getFullYear(),
                                      selectedDate.getMonth(),
                                      selectedDate.getDate(),
                                    );
                                  } else {
                                    next.setHours(
                                      selectedDate.getHours(),
                                      selectedDate.getMinutes(),
                                      0,
                                      0,
                                    );
                                  }
                                  return next;
                                });
                              }
                            }
                            setActiveDraftPicker(null);
                          }}
                        />
                      )}

                      <TouchableOpacity
                        onPress={saveOrganizerDraft}
                        disabled={draftSaving || organizerActionLoading}
                        style={{
                          alignItems: 'center',
                          paddingVertical: 12,
                          borderRadius: 10,
                          marginTop: SPACING.sm,
                          borderWidth: 1,
                          borderColor: COLORS.accent,
                          opacity: draftSaving || organizerActionLoading ? 0.55 : 1,
                        }}
                      >
                        <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '900' }}>
                          {draftSaving ? 'SAVING…' : 'SAVE DRAFT'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={publishOrganizerDraft}
                        disabled={organizerActionLoading || draftSaving}
                        style={{
                          alignItems: 'center',
                          paddingVertical: 13,
                          borderRadius: 10,
                          marginTop: SPACING.sm,
                          backgroundColor: COLORS.accent,
                          opacity: organizerActionLoading || draftSaving ? 0.55 : 1,
                        }}
                      >
                        <Text style={{ color: COLORS.background, fontSize: 11, fontWeight: '900' }}>
                          {organizerActionLoading ? 'PUBLISHING…' : 'PUBLISH COMPETITION'}
                        </Text>
                      </TouchableOpacity>

                      <Text style={{
                        ...TYPOGRAPHY.caption,
                        color: COLORS.textMuted,
                        marginTop: 6,
                      }}>
                        Publishing opens registration. Only the creator can edit or publish this draft.
                      </Text>
                    </View>
                  )}


                  {/* Cancellation is only offered for statuses accepted by the API. */}
                 {['DRAFT', 'REGISTRATION_OPEN', 'ACTIVE'].includes(competition.status) && (
                   <View style={{
                     borderTopWidth: 1,
                     borderTopColor: COLORS.border,
                     marginTop: SPACING.lg,
                     paddingTop: SPACING.md,
                   }}>
                     <Text style={{ ...TYPOGRAPHY.label, color: COLORS.danger }}>
                       CANCEL COMPETITION
                     </Text>
                     <Text style={{ ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 4 }}>
                       This action is permanent. It is unavailable after review begins.
                     </Text>
                     <TextInput
                       value={cancelReason}
                       onChangeText={setCancelReason}
                       placeholder="Required cancellation reason"
                       placeholderTextColor={COLORS.textMuted}
                       multiline
                       maxLength={1000}
                       style={{
                         color: COLORS.text,
                         backgroundColor: COLORS.background,
                         borderColor: COLORS.border,
                         borderWidth: 1,
                         borderRadius: 10,
                         paddingHorizontal: SPACING.md,
                         paddingVertical: SPACING.sm,
                         minHeight: 64,
                         marginTop: SPACING.sm,
                         textAlignVertical: 'top',
                       }}
                     />
                     <TouchableOpacity
                       onPress={cancelOrganizerCompetition}
                       disabled={organizerActionLoading}
                       style={{
                         alignItems: 'center',
                         paddingVertical: 12,
                         borderRadius: 10,
                         marginTop: SPACING.sm,
                         borderWidth: 1,
                         borderColor: COLORS.danger,
                         opacity: organizerActionLoading ? 0.55 : 1,
                       }}
                     >
                       <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '900' }}>
                         {organizerActionLoading ? 'PLEASE WAIT…' : 'CANCEL COMPETITION'}
                       </Text>
                     </TouchableOpacity>
                   </View>
                 )}
               </View>
             )}


             {/* JQ_PHASE7_REWARD_DELIVERY_UI */}
             {isOrganizer &&
               competition.status === 'COMPLETED' &&
               competition.prize_type !== 'NONE' && (
             <View style={{ marginTop: 20, padding: 16, borderRadius: 12, backgroundColor: '#171717' }}>
               <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 10 }}>
                 Rewards & Notification Operations
               </Text>

               <TouchableOpacity
                 onPress={loadOrganizerOperations}
                 disabled={operationsLoading}
                 style={{ padding: 12, borderRadius: 8, backgroundColor: '#292929', marginBottom: 12 }}
               >
                 <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>
                   {operationsLoading ? 'Loading operations…' : 'Refresh reward and delivery status'}
                 </Text>
               </TouchableOpacity>

               <Text style={{ color: '#FFFFFF', fontWeight: '700', marginBottom: 8 }}>
                 Update participant reward
               </Text>

               {[
                 ['Participant user ID', rewardParticipantId, setRewardParticipantId],
                 ['Reward name', rewardName, setRewardName],
                 ['Reason for change (required)', rewardReason, setRewardReason],
                 ['Notes (optional)', rewardNotes, setRewardNotes],
               ].map(([label, value, setter]: any) => (
                 <TextInput
                   key={label}
                   value={value}
                   onChangeText={setter}
                   placeholder={label}
                   placeholderTextColor="#9CA3AF"
                   multiline={String(label).startsWith('Reason') || String(label).startsWith('Notes')}
                   style={{
                     color: '#FFFFFF',
                     backgroundColor: '#262626',
                     borderRadius: 8,
                     padding: 11,
                     marginBottom: 8,
                     minHeight: 44,
                   }}
                 />
               ))}

               <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                 {(['PENDING', 'APPROVED', 'FULFILLED', 'CANCELLED'] as const).map(status => (
                   <TouchableOpacity
                     key={status}
                     onPress={() => setRewardStatus(status)}
                     style={{
                       paddingVertical: 8,
                       paddingHorizontal: 10,
                       borderRadius: 8,
                       backgroundColor: rewardStatus === status ? '#2563EB' : '#303030',
                     }}
                   >
                     <Text style={{ color: '#FFFFFF', fontSize: 12 }}>{status}</Text>
                   </TouchableOpacity>
                 ))}
               </View>

               <TouchableOpacity
                 onPress={saveOrganizerReward}
                 disabled={organizerActionLoading}
                 style={{ padding: 12, borderRadius: 8, backgroundColor: '#2563EB' }}
               >
                 <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '700' }}>
                   {organizerActionLoading ? 'Saving…' : 'Save reward status'}
                 </Text>
               </TouchableOpacity>

               <Text style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 18, marginBottom: 8 }}>
                 Recorded rewards ({adminRewards.length})
               </Text>
               {adminRewards.length === 0 ? (
                 <Text style={{ color: '#A3A3A3' }}>No reward records found. Refresh to load current records.</Text>
               ) : adminRewards.map((reward: any) => (
                 <View key={reward.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#333333' }}>
                   <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                     {reward.reward_name} — {reward.status}
                   </Text>
                   <Text style={{ color: '#A3A3A3', fontSize: 12 }}>
                     {reward.display_name || reward.username || reward.participant_id}
                   </Text>
                   {!!reward.notes && <Text style={{ color: '#A3A3A3' }}>{reward.notes}</Text>}
                 </View>
               ))}

               <Text style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 18, marginBottom: 8 }}>
                 Notification delivery failures ({deliveryFailures.length})
               </Text>
               {deliveryFailures.length === 0 ? (
                 <Text style={{ color: '#A3A3A3' }}>
                   No recorded delivery failures. This does not confirm delivery success if no provider attempts have been recorded.
                 </Text>
               ) : deliveryFailures.map((failure: any) => (
                 <View key={failure.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#333333' }}>
                   <Text style={{ color: '#FCA5A5', fontWeight: '600' }}>
                     {failure.notification_title || failure.notification_type || 'Notification failed'}
                   </Text>
                   <Text style={{ color: '#A3A3A3', fontSize: 12 }}>
                     Provider: {failure.provider} · Attempt: {failure.attempt_number}
                   </Text>
                   {!!failure.error_message && (
                     <Text style={{ color: '#D4D4D4', marginTop: 4 }}>{failure.error_message}</Text>
                   )}
                 </View>
               ))}
             </View>
             )}

             {/* PHASE 8: SPONSORED REWARDS */}
             {competition?.status === 'COMPLETED' &&
               ['SPONSORED', 'MIXED'].includes(competition.prize_type || 'NONE') &&
               (isOrganizer || joined) && (
               <View style={{ backgroundColor: '#171717', borderWidth: 1, borderColor: '#333333', borderRadius: 14, padding: 14, marginBottom: 18 }}>
                 <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginBottom: 5 }}>
                   SPONSORED REWARDS
                 </Text>
                 <Text style={{ color: '#A3A3A3', fontSize: 12, marginBottom: 12 }}>
                   Rewards are offered after official results are finalized. Claims are recorded in the challenge audit history.
                 </Text>

                 {sponsoredLoading && <ActivityIndicator color={COLORS.accent} />}
                 {isOrganizer && (
                   <>
                     <Text style={{ color: '#FFFFFF', fontWeight: '800', marginTop: 8, marginBottom: 8 }}>
                       Create reward offer
                     </Text>
                     {[
                       ['Sponsor name', sponsorNameInput, setSponsorNameInput],
                       ['Reward name', sponsoredRewardNameInput, setSponsoredRewardNameInput],
                       ['Description', sponsoredDescriptionInput, setSponsoredDescriptionInput],
                       ['Quantity', sponsoredQuantityInput, setSponsoredQuantityInput],
                       ['Claim deadline (ISO date/time, optional)', sponsoredDeadlineInput, setSponsoredDeadlineInput],
                     ].map(([label, value, setter]: any) => (
                       <TextInput
                         key={label}
                         value={value}
                         onChangeText={setter}
                         placeholder={label}
                         placeholderTextColor="#737373"
                         keyboardType={label === 'Quantity' ? 'numeric' : 'default'}
                         multiline={label === 'Description'}
                         style={{ color: '#FFFFFF', backgroundColor: '#262626', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 8, minHeight: label === 'Description' ? 64 : 42 }}
                       />
                     ))}

                     <Text style={{ color: '#A3A3A3', fontSize: 11, marginBottom: 6 }}>ELIGIBILITY</Text>
                     <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                       {(['ALL_PARTICIPANTS', 'TOP_3', 'RANK_1', 'RANK_2', 'RANK_3'] as const).map(value => (
                         <TouchableOpacity key={value} onPress={() => setSponsoredEligibilityInput(value)} style={{ paddingVertical: 7, paddingHorizontal: 9, borderRadius: 8, backgroundColor: sponsoredEligibilityInput === value ? '#2563EB' : '#303030' }}>
                           <Text style={{ color: '#FFFFFF', fontSize: 10 }}>{value.replace(/_/g, ' ')}</Text>
                         </TouchableOpacity>
                       ))}
                     </View>

                     <Text style={{ color: '#A3A3A3', fontSize: 11, marginBottom: 6 }}>UNCLAIMED REWARD POLICY</Text>
                     <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>
                       {(['EXPIRE', 'RETURN_TO_SPONSOR'] as const).map(value => (
                         <TouchableOpacity key={value} onPress={() => setSponsoredPolicyInput(value)} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: sponsoredPolicyInput === value ? '#2563EB' : '#303030' }}>
                           <Text style={{ color: '#FFFFFF', fontSize: 10 }}>{value.replace(/_/g, ' ')}</Text>
                         </TouchableOpacity>
                       ))}
                     </View>

                     <TouchableOpacity onPress={createSponsoredReward} disabled={sponsoredActionLoading} style={{ padding: 12, borderRadius: 8, backgroundColor: '#2563EB', opacity: sponsoredActionLoading ? 0.5 : 1 }}>
                       <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '800' }}>
                         {sponsoredActionLoading ? 'Saving…' : 'Create sponsored reward'}
                       </Text>
                     </TouchableOpacity>

                     <Text style={{ color: '#FFFFFF', fontWeight: '800', marginTop: 18, marginBottom: 8 }}>
                       Offer management ({sponsoredOffers.length})
                     </Text>
                     <TextInput
                       value={sponsoredOfferReason}
                       onChangeText={setSponsoredOfferReason}
                       placeholder="Reason required to pause, resume, or close an offer"
                       placeholderTextColor="#737373"
                       style={{ color: '#FFFFFF', backgroundColor: '#262626', borderRadius: 8, padding: 10, marginBottom: 8 }}
                     />
                     {sponsoredOffers.length === 0 ? (
                       <Text style={{ color: '#A3A3A3', fontSize: 12 }}>No sponsored offers created yet.</Text>
                     ) : sponsoredOffers.map((offer: any) => (
                       <View key={offer.id} style={{ borderTopWidth: 1, borderTopColor: '#333333', paddingVertical: 10 }}>
                         <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{offer.reward_name} · {offer.status}</Text>
                         <Text style={{ color: '#A3A3A3', fontSize: 11 }}>{offer.sponsor_name} · {offer.claimed_count}/{offer.quantity} claimed · {offer.remaining_quantity} remaining</Text>
                         <Text style={{ color: '#A3A3A3', fontSize: 11, marginTop: 3 }}>{offer.description}</Text>
                         {!!offer.claim_deadline && <Text style={{ color: '#A3A3A3', fontSize: 10, marginTop: 3 }}>Deadline: {new Date(offer.claim_deadline).toLocaleString()}</Text>}
                         {!!offer.unclaimed_processed_at && <Text style={{ color: '#A3A3A3', fontSize: 10, marginTop: 3 }}>Closed out: {offer.unclaimed_quantity} unclaimed · {offer.returned_quantity} recorded as returned</Text>}
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                           {offer.status === 'ACTIVE' && <TouchableOpacity onPress={() => changeSponsoredOfferStatus(offer.id, 'PAUSED')} style={{ backgroundColor: '#404040', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>PAUSE</Text></TouchableOpacity>}
                           {offer.status === 'PAUSED' && <TouchableOpacity onPress={() => changeSponsoredOfferStatus(offer.id, 'ACTIVE')} style={{ backgroundColor: '#2563EB', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>RESUME</Text></TouchableOpacity>}
                           {offer.status !== 'CLOSED' && <TouchableOpacity onPress={() => changeSponsoredOfferStatus(offer.id, 'CLOSED')} style={{ backgroundColor: '#7F1D1D', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>CLOSE</Text></TouchableOpacity>}
                         </View>
                       </View>
                     ))}

                     <Text style={{ color: '#FFFFFF', fontWeight: '800', marginTop: 16, marginBottom: 8 }}>
                       Participant claims ({sponsoredClaims.length})
                     </Text>
                     <TextInput
                       value={sponsoredClaimReason}
                       onChangeText={setSponsoredClaimReason}
                       placeholder="Reason required to approve, fulfill, or cancel a claim"
                       placeholderTextColor="#737373"
                       style={{ color: '#FFFFFF', backgroundColor: '#262626', borderRadius: 8, padding: 10, marginBottom: 8 }}
                     />
                     {sponsoredClaims.length === 0 ? (
                       <Text style={{ color: '#A3A3A3', fontSize: 12 }}>No participant claims yet.</Text>
                     ) : sponsoredClaims.map((claim: any) => (
                       <View key={claim.id} style={{ borderTopWidth: 1, borderTopColor: '#333333', paddingVertical: 9 }}>
                         <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{claim.username || claim.display_name || claim.user_id} · {claim.status}</Text>
                         <Text style={{ color: '#A3A3A3', fontSize: 11 }}>{claim.reward_name || claim.sponsor_name || 'Sponsored reward'} · {new Date(claim.claimed_at).toLocaleString()}</Text>
                         {claim.status === 'CLAIMED' && (
                           <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                             <TouchableOpacity onPress={() => changeSponsoredClaimStatus(claim.id, 'APPROVED')} style={{ backgroundColor: '#2563EB', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>APPROVE</Text></TouchableOpacity>
                             <TouchableOpacity onPress={() => changeSponsoredClaimStatus(claim.id, 'CANCELLED')} style={{ backgroundColor: '#7F1D1D', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>CANCEL</Text></TouchableOpacity>
                           </View>
                         )}
                         {claim.status === 'APPROVED' && (
                           <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                             <TouchableOpacity onPress={() => changeSponsoredClaimStatus(claim.id, 'FULFILLED')} style={{ backgroundColor: '#166534', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>MARK FULFILLED</Text></TouchableOpacity>
                             <TouchableOpacity onPress={() => changeSponsoredClaimStatus(claim.id, 'CANCELLED')} style={{ backgroundColor: '#7F1D1D', padding: 8, borderRadius: 7 }}><Text style={{ color: '#FFFFFF', fontSize: 10 }}>CANCEL</Text></TouchableOpacity>
                           </View>
                         )}
                       </View>
                     ))}
                   </>
                 )}

                 {joined && (
                   <>
                     <Text style={{ color: '#FFFFFF', fontWeight: '800', marginTop: isOrganizer ? 18 : 8, marginBottom: 8 }}>
                       Rewards available to you
                     </Text>
                     {participantSponsoredOffers.length === 0 ? (
                       <Text style={{ color: '#A3A3A3', fontSize: 12 }}>No active sponsored rewards are currently available to you.</Text>
                     ) : participantSponsoredOffers.map((offer: any) => (
                       <View key={offer.id} style={{ borderTopWidth: 1, borderTopColor: '#333333', paddingVertical: 10 }}>
                         <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{offer.reward_name} · {offer.sponsor_name}</Text>
                         <Text style={{ color: '#A3A3A3', fontSize: 12, marginTop: 3 }}>{offer.description}</Text>
                         <Text style={{ color: '#A3A3A3', fontSize: 10, marginTop: 4 }}>Eligibility: {offer.eligibility_type.replaceAll('_', ' ')} · Remaining: {offer.remaining_quantity}</Text>
                         {!!offer.claim_deadline && <Text style={{ color: '#A3A3A3', fontSize: 10 }}>Claim by: {new Date(offer.claim_deadline).toLocaleString()}</Text>}
                         {!!offer.my_claim_status && <Text style={{ color: '#93C5FD', fontSize: 11, marginTop: 4 }}>Your claim: {offer.my_claim_status}</Text>}
                         {!offer.my_claim_status && offer.eligible && Number(offer.remaining_quantity) > 0 && offer.status === 'ACTIVE' && (
                           <TouchableOpacity onPress={() => claimSponsoredReward(offer.id)} disabled={sponsoredActionLoading} style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: '#2563EB' }}>
                             <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '800' }}>CLAIM REWARD</Text>
                           </TouchableOpacity>
                         )}
                         {!offer.eligible && <Text style={{ color: '#A3A3A3', fontSize: 10, marginTop: 4 }}>Your official result does not meet this offer's eligibility rules.</Text>}
                         {Number(offer.remaining_quantity) <= 0 && <Text style={{ color: '#FCA5A5', fontSize: 10, marginTop: 4 }}>All units have been claimed.</Text>}
                       </View>
                     ))}
                   </>
                 )}
               </View>
             )}

             {/* Leaderboard heading */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeadingLeft}>
                <Text style={styles.sectionEyebrow}>
                  THE RACE
                </Text>

                <Text style={styles.sectionTitle}>
                  Leaderboard
                </Text>

                <Text style={styles.sectionSubtitle}>
                  See who's leading the challenge.
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {leaderboard.length}
                </Text>
              </View>
            </View>

            {/* Table header */}
            {leaderboard.length > 0 && (
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderRank}>RANK</Text>
                <Text style={styles.tableHeaderAthlete}>
                  ATHLETE
                </Text>
                <Text style={styles.tableHeaderScore}>SCORE</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentUser = item.user_id === userId;
          const displayName = item.display_name?.trim() || 'Runner';
          const initial = displayName.charAt(0).toUpperCase();

          return (
            <TouchableOpacity
              style={[
                styles.leaderboardRow,
                isCurrentUser && styles.currentUserRow,
              ]}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('PublicProfile', {
                  userId: item.user_id,
                })
              }
            >
              <View style={styles.rankColumn}>
                {item.rank <= 3 ? (
                  <View
                    style={[
                      styles.medal,
                      item.rank === 1 && styles.goldMedal,
                      item.rank === 2 && styles.silverMedal,
                      item.rank === 3 && styles.bronzeMedal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.medalText,
                        item.rank === 1 && styles.goldMedalText,
                      ]}
                    >
                      {item.rank}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.rankText,
                      isCurrentUser && styles.highlightText,
                    ]}
                  >
                    {String(item.rank).padStart(2, '0')}
                  </Text>
                )}
              </View>

              <View
                style={[
                  styles.avatar,
                  isCurrentUser && styles.currentUserAvatar,
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    isCurrentUser && styles.currentUserAvatarText,
                  ]}
                >
                  {initial}
                </Text>
              </View>

              <View style={styles.athleteInfo}>
                <View style={styles.athleteNameRow}>
                  <Text
                    style={[
                      styles.userName,
                      isCurrentUser && styles.highlightText,
                    ]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>

                  {isCurrentUser && (
                    <View style={styles.youTag}>
                      <Text style={styles.youTagText}>YOU</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.userUsername} numberOfLines={1}>
                  @{item.username || 'runner'}
                </Text>
              </View>

              <View style={styles.scoreColumn}>
                <Text
                  style={[
                    styles.userScore,
                    isCurrentUser && styles.highlightText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatScore(Number(item.score))}
                </Text>

                <Text style={styles.scoreCaption}>SCORE</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyLeaderboard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>🏁</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No runners yet
            </Text>

            <Text style={styles.emptyDescription}>
              Be the first to join this challenge and claim your place.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Text style={styles.footerNote}>
            Rankings update as competition data changes.
          </Text>
        }
      />
    </View>
  );
};

export default CompetitionDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },

  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 48,
  },

  loadingText: {
    ...TYPOGRAPHY.caption,
    marginTop: SPACING.md,
  },

  // Hero
  hero: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  eyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },

  statusBadge: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
  },

  heroName: {
    ...TYPOGRAPHY.hero,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.5,
  },

  heroDescription: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },

  heroDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
  },

  heroDates: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  dateBlock: {
    flex: 1,
  },

  dateDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },

  dateLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
  },

  dateValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },

  // Countdown
  timerCard: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: 22,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },

  timerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  timerIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  timerLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },

  timerValue: {
    color: COLORS.accent,
    fontSize: 37,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: SPACING.md,
  },

  timerValueSmall: {
    fontSize: 25,
    letterSpacing: 0,
  },

  timerCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },

  // Personal performance
  youCard: {
    backgroundColor: 'rgba(212,255,0,0.07)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 20,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  youCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  youEyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },

  youBadge: {
    color: COLORS.background,
    backgroundColor: COLORS.accent,
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 8,
    fontWeight: '900',
  },

  youStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  youStat: {
    flex: 1,
  },

  youDivider: {
    width: 1,
    height: 48,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },

  youLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    fontSize: 9,
  },

  youRank: {
    color: COLORS.accent,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 5,
  },

  youScore: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 9,
  },

  // Join
  joinButton: {
    minHeight: 58,
    backgroundColor: COLORS.accent,
    borderRadius: 17,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.glow,
  },

  leaveButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.danger,
    ...SHADOWS.soft,
  },

  joinButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  leaveButtonText: {
    color: COLORS.danger,
  },

  joinButtonArrow: {
    color: COLORS.background,
    fontSize: 19,
    fontWeight: '900',
    marginLeft: 10,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },

  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statIcon: {
    color: COLORS.accent,
    fontSize: 21,
    fontWeight: '800',
  },

  statValue: {
    ...TYPOGRAPHY.h2,
    fontSize: 21,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },

  statLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 5,
  },

  // Leaderboard heading
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },

  sectionHeadingLeft: {
    flex: 1,
  },

  sectionEyebrow: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.accent,
    letterSpacing: 1.2,
  },

  sectionTitle: {
    ...TYPOGRAPHY.hero,
    fontSize: 24,
    marginTop: 5,
  },

  sectionSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 5,
  },

  countBadge: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },

  countBadgeText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
  },

  // Table header
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 12,
  },

  tableHeaderRank: {
    width: 36,
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  tableHeaderAthlete: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 12,
  },

  tableHeaderScore: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Leaderboard rows
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  currentUserRow: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(212,255,0,0.06)',
  },

  rankColumn: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  rankText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },

  medal: {
    width: 27,
    height: 27,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceHighlight,
  },

  goldMedal: {
    backgroundColor: COLORS.accent,
  },

  silverMedal: {
    backgroundColor: '#D1D5DB',
  },

  bronzeMedal: {
    backgroundColor: '#CD9A69',
  },

  medalText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
  },

  goldMedalText: {
    color: COLORS.background,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  currentUserAvatar: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },

  avatarText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  currentUserAvatarText: {
    color: COLORS.background,
  },

  athleteInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },

  athleteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  userName: {
    ...TYPOGRAPHY.h3,
    fontSize: 12,
    flexShrink: 1,
  },

  highlightText: {
    color: COLORS.accent,
  },

  youTag: {
    backgroundColor: 'rgba(212,255,0,0.12)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },

  youTagText: {
    color: COLORS.accent,
    fontSize: 7,
    fontWeight: '900',
  },

  userUsername: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    marginTop: 4,
  },

  scoreColumn: {
    alignItems: 'flex-end',
    maxWidth: 100,
    marginLeft: 8,
  },

  userScore: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
  },

  scoreCaption: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    fontSize: 7,
    marginTop: 4,
  },

  // Empty / error
  emptyLeaderboard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },

  emptyIconText: {
    color: COLORS.accent,
    fontSize: 25,
    fontWeight: '900',
  },

  emptyTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    textAlign: 'center',
  },

  emptyDescription: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    borderRadius: 13,
    marginTop: SPACING.lg,
  },

  retryButtonText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  errorBox: {
    backgroundColor: 'rgba(255,69,58,0.08)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.md,
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
    marginTop: 5,
  },

  footerNote: {
    ...TYPOGRAPHY.caption,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
});