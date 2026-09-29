import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  RouteProp,
  useRoute,
} from '@react-navigation/native';

import type {
  RootStackParamList,
} from '../../navigation/types';

type TerritoryDetailsRouteProp =
  RouteProp<
    RootStackParamList,
    'TerritoryDetails'
  >;

type TerritoryDetails = {
  id: string;
  user_id: string;
  activity_id: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  area_m2: number;
  area_km2: number;
  captured_at: string;
  owner_username: string;
  owner_display_name: string;
  distance_km: number | null;
  elapsed_seconds: number | null;
  pace: string | null;
  latest_action: string | null;
  status: string;
};

type TerritoryChallenge = {
  id: string;
  territory_id: string;
  activity_id: string;
  challenger_id: string;
  overlap_area_m2: number;
  overlap_ratio: number;
  status:
    | 'PENDING'
    | 'ACCEPTED'
    | 'REJECTED';
  created_at: string;
  resolved_at: string | null;
  challenger_username: string;
  challenger_display_name: string;
};

type TerritoryHistoryItem = {
  id: string;
  territory_id: string;
  action:
    | 'CAPTURED'
    | 'CHALLENGE_REJECTED'
    | 'TRANSFERRED';
  previous_owner_id: string | null;
  previous_owner_username: string | null;
  previous_owner_display_name: string | null;
  new_owner_id: string | null;
  new_owner_username: string | null;
  new_owner_display_name: string | null;
  created_at: string;
};

type Activity = {
  id: string;
  activity_type: 'Run' | 'Walk' | 'Cycle';
  distance_km: number;
  elapsed_seconds: number;
  pace: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type ActivityRoutePoint = {
  sequence_number: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const TerritoryDetailsScreen = () => {
  const route =
    useRoute<TerritoryDetailsRouteProp>();

  const {
    territoryId,
  } = route.params;

  const [territory, setTerritory] =
    useState<TerritoryDetails | null>(
      null,
    );

  const [challenges, setChallenges] =
    useState<TerritoryChallenge[]>([]);

  const [history, setHistory] =
    useState<TerritoryHistoryItem[]>([]);

  const [activities, setActivities] =
    useState<Activity[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [challengeLoading, setChallengeLoading] =
    useState(false);

  const [activityLoading, setActivityLoading] =
    useState(false);

  const [submittingChallenge, setSubmittingChallenge] =
    useState(false);

  const [selectedActivityId, setSelectedActivityId] =
    useState<string | null>(null);

  const [challengeModalVisible, setChallengeModalVisible] =
    useState(false);

  const [resolvingId, setResolvingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  // --------------------------------------------------
  // Load territory
  // --------------------------------------------------

  const loadTerritory =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/territories/${territoryId}`,
          );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as TerritoryDetails;

        setTerritory(data);
      } catch (err) {
        console.error(
          'Failed to load territory:',
          err,
        );

        setError(
          'Could not load territory details.',
        );
      } finally {
        setLoading(false);
      }
    }, [territoryId]);

  // --------------------------------------------------
  // Load challenges
  // --------------------------------------------------

  const loadChallenges =
    useCallback(async () => {
      try {
        setChallengeLoading(true);

        const response =
          await fetch(
            `${API_BASE_URL}/api/territories/${territoryId}/challenges`,
          );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as TerritoryChallenge[];

        setChallenges(data);
      } catch (err) {
        console.error(
          'Failed to load challenges:',
          err,
        );
      } finally {
        setChallengeLoading(false);
      }
    }, [territoryId]);

  // --------------------------------------------------
  // Load territory history
  // --------------------------------------------------

  const loadHistory =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            `${API_BASE_URL}/api/territories/${territoryId}/history`,
          );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as TerritoryHistoryItem[];

        setHistory(data);
      } catch (err) {
        console.error(
          'Failed to load territory history:',
          err,
        );
      }
    }, [territoryId]);

  // --------------------------------------------------
  // Load user's activities
  // --------------------------------------------------

  const loadActivities =
    useCallback(async () => {
      try {
        setActivityLoading(true);

        const response =
          await fetch(
            `${API_BASE_URL}/api/activities/${DEV_USER_ID}`,
          );

        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}`,
          );
        }

        const data =
          (await response.json()) as Activity[];

        setActivities(data);
      } catch (err) {
        console.error(
          'Failed to load activities:',
          err,
        );
      } finally {
        setActivityLoading(false);
      }
    }, []);

  // --------------------------------------------------
  // Initial loading
  // --------------------------------------------------

  useEffect(() => {
    loadTerritory();
    loadChallenges();
    loadHistory();
  }, [
    loadTerritory,
    loadChallenges,
    loadHistory,
  ]);

  // --------------------------------------------------
  // Open challenge modal
  // --------------------------------------------------

  const openChallengeModal =
    async () => {
      await loadActivities();

      setSelectedActivityId(null);
      setChallengeModalVisible(true);
    };

  // --------------------------------------------------
  // Close challenge modal
  // --------------------------------------------------

  const closeChallengeModal =
    () => {
      if (!submittingChallenge) {
        setChallengeModalVisible(false);
      }
    };

  // --------------------------------------------------
  // Submit challenge
  // --------------------------------------------------

  const submitChallenge =
    async () => {
      if (
        !selectedActivityId ||
        submittingChallenge
      ) {
        return;
      }

      try {
        setSubmittingChallenge(true);

        // Get the selected activity's
        // stored GPS route.
        const routeResponse =
          await fetch(
            `${API_BASE_URL}/api/activities/${selectedActivityId}/route`,
          );

        const routeData =
          (await routeResponse.json()) as {
            activity?: Activity;
            route?: ActivityRoutePoint[];
            error?: string;
          };

        if (!routeResponse.ok) {
          throw new Error(
            routeData.error ??
              `Server returned ${routeResponse.status}`,
          );
        }

        const polygon =
          routeData.route?.map(
            point => ({
              latitude: Number(
                point.latitude,
              ),
              longitude: Number(
                point.longitude,
              ),
            }),
          ) ?? [];

        if (polygon.length < 4) {
          throw new Error(
            'Selected activity does not contain enough GPS points.',
          );
        }

        // Send the route polygon to the
        // authoritative server.
        const response =
          await fetch(
            `${API_BASE_URL}/api/territories/${territoryId}/challenges`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                challengerId:
                  DEV_USER_ID,
                activityId:
                  selectedActivityId,
                polygon,
              }),
            },
          );

        const data =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              `Server returned ${response.status}`,
          );
        }

        setChallengeModalVisible(false);
        setSelectedActivityId(null);

        await loadChallenges();
        await loadHistory();
      } catch (err) {
        console.error(
          'Failed to submit challenge:',
          err,
        );
      } finally {
        setSubmittingChallenge(false);
      }
    };

  // --------------------------------------------------
  // Resolve challenge
  // --------------------------------------------------

  const resolveChallenge =
    async (
      challengeId: string,
      decision:
        | 'ACCEPT'
        | 'REJECT',
    ) => {
      try {
        setResolvingId(challengeId);

        const response =
          await fetch(
            `${API_BASE_URL}/api/territories/${territoryId}/challenges/${challengeId}/resolve`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                resolverId:
                  DEV_USER_ID,
                decision,
              }),
            },
          );

        const data =
          (await response.json()) as {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ??
              `Server returned ${response.status}`,
          );
        }

        await Promise.all([
          loadTerritory(),
          loadChallenges(),
          loadHistory(),
        ]);
      } catch (err) {
        console.error(
          'Failed to resolve challenge:',
          err,
        );
      } finally {
        setResolvingId(null);
      }
    };

  // --------------------------------------------------
  // Loading state
  // --------------------------------------------------

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#fff"
        />

        <Text style={styles.loadingText}>
          Loading territory...
        </Text>
      </View>
    );
  }

  // --------------------------------------------------
  // Error state
  // --------------------------------------------------

  if (error || !territory) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ??
            'Territory unavailable.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadTerritory}>
          <Text style={styles.retryText}>
            RETRY
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const capturedDate =
    new Date(
      territory.captured_at,
    );

  const isOwner =
    territory.user_id ===
    DEV_USER_ID;

  const hasPendingOwnChallenge =
    challenges.some(
      challenge =>
        challenge.challenger_id ===
          DEV_USER_ID &&
        challenge.status ===
          'PENDING',
    );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.container
        }>
        {/* ------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------ */}

        <View style={styles.header}>
          <Text style={styles.title}>
            Territory
          </Text>

          <Text style={styles.subtitle}>
            {territory.activity_type} capture
          </Text>
        </View>

        {/* ------------------------------------------ */}
        {/* Area */}
        {/* ------------------------------------------ */}

        <View style={styles.areaCard}>
          <Text style={styles.areaValue}>
            {Number(
              territory.area_km2,
            ).toFixed(3)}{' '}
            km²
          </Text>

          <Text style={styles.areaLabel}>
            TERRITORY AREA
          </Text>
        </View>

        {/* ------------------------------------------ */}
        {/* Territory details */}
        {/* ------------------------------------------ */}

        <View style={styles.infoCard}>
          <View style={styles.row}>
            <Text style={styles.label}>
              OWNER
            </Text>

            <Text style={styles.value}>
              {territory.owner_display_name}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              USERNAME
            </Text>

            <Text style={styles.value}>
              @{territory.owner_username}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              ACTIVITY
            </Text>

            <Text style={styles.value}>
              {territory.activity_type}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              STATUS
            </Text>

            <Text style={styles.value}>
              {territory.status}
            </Text>
          </View>

          {territory.distance_km !==
            null && (
            <View style={styles.row}>
              <Text style={styles.label}>
                DISTANCE
              </Text>

              <Text style={styles.value}>
                {Number(
                  territory.distance_km,
                ).toFixed(2)}{' '}
                km
              </Text>
            </View>
          )}

          {territory.pace && (
            <View style={styles.row}>
              <Text style={styles.label}>
                PACE
              </Text>

              <Text style={styles.value}>
                {territory.pace}
              </Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>
              CAPTURED
            </Text>

            <Text style={styles.value}>
              {capturedDate.toLocaleString()}
            </Text>
          </View>

          <View
            style={[
              styles.row,
              styles.lastRow,
            ]}>
            <Text style={styles.label}>
              TERRITORY ID
            </Text>

            <Text style={styles.value}>
              {territory.id}
            </Text>
          </View>
        </View>

        {/* ------------------------------------------ */}
        {/* Challenger action */}
        {/* ------------------------------------------ */}

        {!isOwner &&
          !hasPendingOwnChallenge && (
            <TouchableOpacity
              style={
                styles.challengeButton
              }
              onPress={
                openChallengeModal
              }>
              <Text
                style={
                  styles.challengeButtonText
                }>
                CHALLENGE TERRITORY
              </Text>
            </TouchableOpacity>
          )}

        {!isOwner &&
          hasPendingOwnChallenge && (
            <View
              style={
                styles.pendingNotice
              }>
              <Text
                style={
                  styles.pendingNoticeText
                }>
                YOUR CHALLENGE IS PENDING
              </Text>
            </View>
          )}

        {/* ------------------------------------------ */}
        {/* Challenges */}
        {/* ------------------------------------------ */}

        <View style={styles.challengeSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Challenges
              </Text>

              <Text style={styles.sectionSubtitle}>
                {challenges.length === 0
                  ? 'No challenges'
                  : `${challenges.length} challenge${
                      challenges.length ===
                      1
                        ? ''
                        : 's'
                    }`}
              </Text>
            </View>

            {challengeLoading && (
              <ActivityIndicator
                color="#fff"
                size="small"
              />
            )}
          </View>

          {challenges.length === 0 && (
            <View
              style={
                styles.emptyChallenge
              }>
              <Text
                style={
                  styles.emptyChallengeText
                }>
                No one has challenged this
                territory yet.
              </Text>
            </View>
          )}

          {challenges.map(
            challenge => {
              const isPending =
                challenge.status ===
                'PENDING';

              return (
                <View
                  key={challenge.id}
                  style={
                    styles.challengeCard
                  }>
                  <View
                    style={
                      styles.challengeTop
                    }>
                    <View
                      style={
                        styles.challengeUser
                      }>
                      <View
                        style={
                          styles.challengeAvatar
                        }>
                        <Text
                          style={
                            styles.challengeAvatarText
                          }>
                          {challenge.challenger_display_name
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View>
                        <Text
                          style={
                            styles.challengeName
                          }>
                          {
                            challenge.challenger_display_name
                          }
                        </Text>

                        <Text
                          style={
                            styles.challengeUsername
                          }>
                          @
                          {
                            challenge.challenger_username
                          }
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        challenge.status ===
                          'PENDING' &&
                          styles.pendingBadge,
                        challenge.status ===
                          'ACCEPTED' &&
                          styles.acceptedBadge,
                        challenge.status ===
                          'REJECTED' &&
                          styles.rejectedBadge,
                      ]}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          challenge.status !==
                            'PENDING' &&
                            styles.darkStatusText,
                        ]}>
                        {
                          challenge.status
                        }
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.challengeStats
                    }>
                    <View>
                      <Text
                        style={
                          styles.challengeStatLabel
                        }>
                        OVERLAP
                      </Text>

                      <Text
                        style={
                          styles.challengeStatValue
                        }>
                        {(
                          Number(
                            challenge.overlap_ratio,
                          ) * 100
                        ).toFixed(1)}
                        %
                      </Text>
                    </View>

                    <View>
                      <Text
                        style={
                          styles.challengeStatLabel
                        }>
                        AREA
                      </Text>

                      <Text
                        style={
                          styles.challengeStatValue
                        }>
                        {(
                          Number(
                            challenge.overlap_area_m2,
                          ) /
                          1_000_000
                        ).toFixed(3)}{' '}
                        km²
                      </Text>
                    </View>
                  </View>

                  {isOwner &&
                    isPending && (
                      <View
                        style={
                          styles.actionRow
                        }>
                        <TouchableOpacity
                          style={
                            styles.rejectButton
                          }
                          disabled={
                            resolvingId ===
                            challenge.id
                          }
                          onPress={() =>
                            resolveChallenge(
                              challenge.id,
                              'REJECT',
                            )
                          }>
                          <Text
                            style={
                              styles.rejectText
                            }>
                            REJECT
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={
                            styles.acceptButton
                          }
                          disabled={
                            resolvingId ===
                            challenge.id
                          }
                          onPress={() =>
                            resolveChallenge(
                              challenge.id,
                              'ACCEPT',
                            )
                          }>
                          {resolvingId ===
                          challenge.id ? (
                            <ActivityIndicator
                              color="#000"
                              size="small"
                            />
                          ) : (
                            <Text
                              style={
                                styles.acceptText
                              }>
                              ACCEPT
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                </View>
              );
            },
          )}
        </View>

        {/* ------------------------------------------ */}
        {/* History */}
        {/* ------------------------------------------ */}

        <View style={styles.historySection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                History
              </Text>

              <Text style={styles.sectionSubtitle}>
                {history.length === 0
                  ? 'No history'
                  : `${history.length} event${
                      history.length === 1
                        ? ''
                        : 's'
                    }`}
              </Text>
            </View>
          </View>

          {history.length === 0 ? (
            <View
              style={
                styles.emptyHistory
              }>
              <Text
                style={
                  styles.emptyHistoryText
                }>
                No territory history yet.
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.historyCard
              }>
              {history.map(
                (item, index) => {
                  let title = '';
                  let description = '';

                  if (
                    item.action ===
                    'CAPTURED'
                  ) {
                    title =
                      'Territory Captured';

                    description =
                      item.new_owner_display_name
                        ? `${item.new_owner_display_name} captured this territory.`
                        : 'Territory was captured.';
                  } else if (
                    item.action ===
                    'CHALLENGE_REJECTED'
                  ) {
                    title =
                      'Challenge Rejected';

                    description =
                      item.new_owner_display_name
                        ? `Challenge rejected. ${item.new_owner_display_name} remained the owner.`
                        : 'Challenge rejected.';
                  } else if (
                    item.action ===
                    'TRANSFERRED'
                  ) {
                    title =
                      'Territory Transferred';

                    description =
                      item.previous_owner_display_name &&
                      item.new_owner_display_name
                        ? `${item.previous_owner_display_name} → ${item.new_owner_display_name}`
                        : 'Ownership changed.';
                  }

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.historyItem,
                        index ===
                          history.length -
                            1 &&
                          styles.lastHistoryItem,
                      ]}>
                      <View
                        style={
                          styles.historyDot
                        }
                      />

                      <View
                        style={
                          styles.historyContent
                        }>
                        <Text
                          style={
                            styles.historyTitle
                          }>
                          {title}
                        </Text>

                        <Text
                          style={
                            styles.historyDescription
                          }>
                          {description}
                        </Text>

                        <Text
                          style={
                            styles.historyDate
                          }>
                          {new Date(
                            item.created_at,
                          ).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  );
                },
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* -------------------------------------------- */}
      {/* Challenge activity modal */}
      {/* -------------------------------------------- */}

      <Modal
        visible={
          challengeModalVisible
        }
        transparent
        animationType="slide"
        onRequestClose={
          closeChallengeModal
        }>
        <View
          style={
            styles.modalOverlay
          }>
          <View
            style={
              styles.modalCard
            }>
            <View
              style={
                styles.modalHeader
              }>
              <View>
                <Text
                  style={
                    styles.modalTitle
                  }>
                  Challenge Territory
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }>
                  Choose an activity
                </Text>
              </View>

              <TouchableOpacity
                onPress={
                  closeChallengeModal
                }
                disabled={
                  submittingChallenge
                }>
                <Text
                  style={
                    styles.closeText
                  }>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            {activityLoading ? (
              <View
                style={
                  styles.activityLoading
                }>
                <ActivityIndicator
                  color="#fff"
                />

                <Text
                  style={
                    styles.activityLoadingText
                  }>
                  Loading activities...
                </Text>
              </View>
            ) : activities.length ===
              0 ? (
              <View
                style={
                  styles.noActivities
                }>
                <Text
                  style={
                    styles.noActivitiesText
                  }>
                  No activities available.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={
                  styles.activityList
                }>
                {activities.map(
                  activity => {
                    const selected =
                      selectedActivityId ===
                      activity.id;

                    return (
                      <TouchableOpacity
                        key={
                          activity.id
                        }
                        style={[
                          styles.activityCard,
                          selected &&
                            styles.selectedActivityCard,
                        ]}
                        onPress={() =>
                          setSelectedActivityId(
                            activity.id,
                          )
                        }
                        disabled={
                          submittingChallenge
                        }>
                        <View>
                          <Text
                            style={
                              styles.activityTitle
                            }>
                            {
                              activity.activity_type
                            }
                          </Text>

                          <Text
                            style={
                              styles.activityDate
                            }>
                            {new Date(
                              activity.created_at,
                            ).toLocaleDateString(
                              'en-IN',
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.activityStats
                          }>
                          <Text
                            style={
                              styles.activityStat
                            }>
                            {Number(
                              activity.distance_km,
                            ).toFixed(2)}{' '}
                            km
                          </Text>

                          <Text
                            style={
                              styles.activityStat
                            }>
                            {
                              activity.pace
                            }
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  },
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                !selectedActivityId &&
                  styles.submitButtonDisabled,
              ]}
              disabled={
                !selectedActivityId ||
                submittingChallenge
              }
              onPress={
                submitChallenge
              }>
              {submittingChallenge ? (
                <ActivityIndicator
                  color="#000"
                />
              ) : (
                <Text
                  style={
                    styles.submitButtonText
                  }>
                  SUBMIT CHALLENGE
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default TerritoryDetailsScreen;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000',
  },

  container: {
    padding: 20,
    paddingBottom: 50,
  },

  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingText: {
    color: '#777',
    marginTop: 12,
  },

  errorText: {
    color: '#aaa',
    textAlign: 'center',
  },

  retryButton: {
    marginTop: 18,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },

  retryText: {
    color: '#000',
    fontWeight: '900',
  },

  header: {
    marginTop: 15,
  },

  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
  },

  subtitle: {
    color: '#777',
    marginTop: 5,
  },

  areaCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 30,
    alignItems: 'center',
    marginTop: 25,
  },

  areaValue: {
    color: '#000',
    fontSize: 36,
    fontWeight: '900',
  },

  areaLabel: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5,
  },

  infoCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 18,
    marginTop: 20,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  label: {
    color: '#666',
    fontSize: 10,
    fontWeight: '800',
  },

  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },

  challengeButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },

  challengeButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
  },

  pendingNotice: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    marginTop: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },

  pendingNoticeText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '900',
  },

  challengeSection: {
    marginTop: 22,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 3,
  },

  emptyChallenge: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
  },

  emptyChallengeText: {
    color: '#666',
    lineHeight: 20,
  },

  challengeCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
  },

  challengeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  challengeUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  challengeAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  challengeAvatarText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },

  challengeName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  challengeUsername: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#222',
  },

  pendingBadge: {
    backgroundColor: '#fff',
  },

  acceptedBadge: {
    backgroundColor: '#222',
  },

  rejectedBadge: {
    backgroundColor: '#222',
  },

  statusBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },

  darkStatusText: {
    color: '#fff',
  },

  challengeStats: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  challengeStatLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '800',
  },

  challengeStatValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },

  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#444',
    paddingVertical: 13,
    borderRadius: 13,
    alignItems: 'center',
  },

  rejectText: {
    color: '#aaa',
    fontWeight: '900',
    fontSize: 11,
  },

  acceptButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 13,
    borderRadius: 13,
    alignItems: 'center',
  },

  acceptText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 11,
  },

  historySection: {
    marginTop: 22,
  },

  emptyHistory: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
  },

  emptyHistoryText: {
    color: '#666',
    lineHeight: 20,
  },

  historyCard: {
    backgroundColor: '#111',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 4,
    borderWidth: 1,
    borderColor: '#222',
  },

  historyItem: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },

  lastHistoryItem: {
    borderBottomWidth: 0,
  },

  historyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#fff',
    marginTop: 6,
    marginRight: 12,
  },

  historyContent: {
    flex: 1,
  },

  historyTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },

  historyDescription: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  historyDate: {
    color: '#555',
    fontSize: 10,
    marginTop: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: '#0b0b0b',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '82%',
    borderTopWidth: 1,
    borderColor: '#222',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },

  modalSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },

  closeText: {
    color: '#aaa',
    fontSize: 22,
    fontWeight: '700',
  },

  activityLoading: {
    alignItems: 'center',
    paddingVertical: 30,
  },

  activityLoadingText: {
    color: '#666',
    marginTop: 10,
  },

  noActivities: {
    paddingVertical: 30,
    alignItems: 'center',
  },

  noActivitiesText: {
    color: '#666',
  },

  activityList: {
    marginBottom: 16,
  },

  activityCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
  },

  selectedActivityCard: {
    borderColor: '#fff',
    backgroundColor: '#1c1c1c',
  },

  activityTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  activityDate: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },

  activityStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  activityStat: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
  },

  submitButton: {
    backgroundColor: '#fff',
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
  },

  submitButtonDisabled: {
    backgroundColor: '#333',
  },

  submitButtonText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
});