# JogQuest Challenge Module — Implementation Roadmap

**Version:** 1.0  
**Date:** 28 October 2026  
**Goal:** Complete the JogQuest Challenges module in safe, testable steps—from challenge creation and joining through activity scoring, leaderboards, notifications, result finalization, and rewards.

---

## 1. Product goal

Deliver a reliable challenge system where:

1. Organizers can create and manage challenges.
2. Users can discover challenges, understand the rules, and join or withdraw according to those rules.
3. Eligible activities are validated and counted fairly.
4. Scores and leaderboards are consistent and server-authoritative.
5. Participants receive useful, non-duplicated notifications.
6. Results can be reviewed and finalized transparently.
7. Rewards can be tracked safely when rewards are introduced.

**Guiding rule:** The backend is the source of truth for challenge status, membership, eligibility, scores, rankings, results, and reward status. The mobile app must not be trusted to decide these values.

## 2. Scope and release strategy

### First release: reliable free challenges

Prioritize:
- Free challenges.
- Clear rules and dates.
- Join/withdraw flow.
- Activity eligibility and score calculation.
- Accurate leaderboard.
- Challenge lifecycle and final results.
- In-app notifications.
- Basic admin controls.
- Auditability and anti-cheat signals.

Defer cash prizes, entry fees, automated payouts, and complex sponsor workflows until the core challenge lifecycle is reliable and the legal, tax, payment-provider, and operational requirements have been reviewed for the intended markets.

### Challenge types

Support the challenge types already intended by the product, after confirming their current implementation:
- Distance-based.
- Activity-count-based.
- Territory-based.

Do not assume that these types use the same scoring rules. Each type needs an explicit, documented scoring definition.

## 3. Non-negotiable working rules

Before changing code:

- Inspect the current files, database schema/migrations, API routes, and existing tests.
- Do not invent or assume current file contents, schema names, endpoints, or implementation status.
- Request the exact relevant file contents before modifying code when they are not available.
- Make small, reviewable changes and preserve existing working behavior.
- Never put secrets, database passwords, access tokens, or private keys in this roadmap or source control.
- Run the relevant checks after each phase; do not mark a phase complete based only on a successful build.
- Test critical behavior on the backend and on the Android app.
- Record actual results, unresolved issues, and evidence in the checklist below.
- Keep production changes separate from local development until tested and approved.

## 4. Phase 0 — Audit the existing implementation

**Objective:** Establish what already works before writing new code.

### Tasks

- [ ] Inspect challenge list and detail screens.
- [ ] Inspect create-challenge UI and its permissions.
- [ ] Inspect API routes for listing, creating, joining, leaving, scoring, and leaderboard access.
- [ ] Inspect database tables and migrations for challenges, participants, activities, scores, notifications, and rewards (where present).
- [ ] Inspect authentication and authorization checks.
- [ ] Inspect how GPS activities are saved and how territory captures are recorded.
- [ ] Inspect existing notification infrastructure.
- [ ] Inspect tests and available test commands.
- [ ] Check production/local environment differences without exposing secrets.
- [ ] Build a feature inventory: **Working / Partial / Missing / Broken / Not yet verified**.

### Deliverable

A short audit report with exact file paths, existing API behavior, schema findings, tests, and gaps. No feature should be rebuilt until the audit shows it is needed.

### Exit criteria

- [ ] Current implementation and gaps are documented.
- [ ] No assumptions about schema or endpoint behavior remain for the first implementation phase.
- [ ] A baseline build and test result is recorded.

## 5. Phase 1 — Define challenge rules and lifecycle

**Objective:** Make every challenge's rules and status unambiguous.

### Lifecycle

Use an agreed lifecycle such as:

`Draft → Upcoming/Registration Open → Active → Under Review → Completed`

Also define a `Cancelled` path. Confirm whether registration closes separately from the challenge start time. Use the existing schema if suitable; add migrations only when necessary.

### Rules to define

- [ ] Challenge type and scoring unit.
- [ ] Registration opening and closing times.
- [ ] Start time and end time, including timezone handling.
- [ ] Eligibility and participant limits, if any.
- [ ] Whether users may withdraw and under what conditions.
- [ ] Which activities count and how they are validated.
- [ ] Whether activities can count toward multiple challenges.
- [ ] Score calculation and rounding rules.
- [ ] Tie-break rules.
- [ ] Review, dispute, and finalization windows.
- [ ] Cancellation behavior.
- [ ] Reward details, if any, and how they are funded and delivered.

### Implementation tasks

- [ ] Validate challenge configuration on the server.
- [ ] Reject invalid dates, invalid scoring rules, and unauthorized status changes.
- [ ] Enforce legal status transitions on the server.
- [ ] Display status, schedule, scoring rules, and eligibility clearly in the app.
- [ ] Ensure all date comparisons use a consistent timezone strategy.

### Tests

- [ ] Invalid or contradictory dates are rejected.
- [ ] Users cannot join a closed or cancelled challenge.
- [ ] Activities outside the eligible period do not score.
- [ ] Unauthorized users cannot publish, edit, cancel, or finalize challenges.

### Exit criteria

The challenge's state and rules are enforced by the backend and shown clearly to participants.

## 6. Phase 2 — Registration and participation

**Objective:** Make joining and leaving dependable.

### Tasks

- [ ] Validate authentication and challenge eligibility.
- [ ] Prevent duplicate participation using a database constraint or equivalent safe mechanism.
- [ ] Make join requests safe to retry without creating duplicate records.
- [ ] Return a clear response when registration is closed, the user is already joined, or a participant limit has been reached.
- [ ] Show the user's participation state on list and detail screens.
- [ ] Show participant counts based on valid participation records.
- [ ] Implement withdrawal according to the published rules.
- [ ] Preserve historical records where needed for auditing.
- [ ] Ensure concurrent join requests cannot exceed a participant limit.
- [ ] Record relevant join/withdraw events.

### Tests

- [ ] Join as a logged-in user.
- [ ] Attempt to join twice.
- [ ] Attempt to join while logged out.
- [ ] Attempt to join after registration closes.
- [ ] Attempt to join a cancelled/completed challenge.
- [ ] Test simultaneous joins if participant limits exist.
- [ ] Withdraw before and after start according to the configured policy.
- [ ] Verify participant count and UI state after each action.

### Exit criteria

Joining and withdrawal are consistent across the app, API, and database, including retries and error cases.

## 7. Phase 3 — Activity validation and score calculation

**Objective:** Count each eligible activity fairly and exactly once.

### Tasks

- [ ] Map the existing activity-recording flow to challenge scoring.
- [ ] Define the authoritative activity fields used for eligibility.
- [ ] Check activity ownership, completion status, timestamps, and challenge period.
- [ ] Prevent duplicate activity submissions from awarding duplicate points.
- [ ] Implement scoring separately for each supported challenge type.
- [ ] Recalculate scores safely when an eligible activity is corrected or invalidated.
- [ ] Store enough provenance to explain how a score was produced.
- [ ] Decide whether one activity may count toward multiple eligible challenges.
- [ ] Keep score updates transactional where appropriate.
- [ ] Ensure client-supplied score values are never trusted.

### Anti-cheat safeguards

- [ ] Add reasonable checks for implausible speed, distance, duration, and route patterns.
- [ ] Use mock-location signals as risk indicators rather than treating every signal as conclusive proof.
- [ ] Detect duplicate or replayed activity submissions.
- [ ] Add a review path for suspicious activity.
- [ ] Record score adjustments with actor, reason, and timestamp.
- [ ] Avoid automatic irreversible disqualification based on a single uncertain signal.

### Tests

- [ ] Valid activity increases the correct score.
- [ ] Invalid, incomplete, duplicate, or out-of-period activity does not score.
- [ ] One activity cannot be counted twice because of retries.
- [ ] Each challenge type uses its own correct scoring rule.
- [ ] Corrections and invalidations update scores consistently.
- [ ] Unauthorized score manipulation is rejected.
- [ ] GPS/mock-location edge cases are reviewed.

### Exit criteria

Scores are calculated on the server, repeatably, with duplicate prevention and an auditable explanation.

## 8. Phase 4 — Leaderboard and participant progress

**Objective:** Make rankings accurate, explainable, and stable.

### Tasks

- [ ] Calculate rankings from validated challenge scores.
- [ ] Define tie behavior and use the same rule everywhere.
- [ ] Display rank, score, participant identity, and the current user's position.
- [ ] Display the correct participant count.
- [ ] Provide loading, empty, stale-data, and error states.
- [ ] Refresh rankings after valid score changes.
- [ ] Ensure sorting/filtering does not change the underlying score.
- [ ] Prevent client-side manipulation of displayed rank from affecting official results.
- [ ] Review database queries for correct grouping, joins, pagination, and performance.
- [ ] Decide how frequently the live leaderboard refreshes.

### Tests

- [ ] Equal scores follow the documented tie rule.
- [ ] New valid activities update rank correctly.
- [ ] Invalidated activities remove their contribution.
- [ ] Filters and sorting return the expected results.
- [ ] Large participant lists remain usable.
- [ ] Results are consistent across API and app.

### Exit criteria

The leaderboard reflects validated scores and applies one consistent ranking rule.

## 9. Phase 5 — Challenge notifications

**Objective:** Inform users at the right moments without spamming them.

### Initial notification events

- [ ] Join confirmation.
- [ ] Challenge starting soon.
- [ ] Registration deadline approaching, if useful.
- [ ] Important personal milestone, if enabled.
- [ ] Challenge ending soon.
- [ ] Results published.
- [ ] Winner/reward instructions, only when applicable.

### Implementation tasks

- [ ] Inspect existing notification infrastructure before selecting or adding a provider.
- [ ] Start with in-app notifications if supported or straightforward to add.
- [ ] Add Android push notifications after the event flow is reliable.
- [ ] Store event/recipient/delivery state as appropriate.
- [ ] Prevent duplicate notifications on retries.
- [ ] Handle failed deliveries and retry transient failures.
- [ ] Respect user preferences for optional notifications.
- [ ] Keep essential account/result notices distinct from optional engagement messages.
- [ ] Add deep links to the relevant challenge screen where supported.

### Tests

- [ ] Each event produces the expected notification.
- [ ] Reprocessing an event does not create duplicates.
- [ ] Failed delivery can be retried safely.
- [ ] Notifications link to the correct challenge.
- [ ] Disabled optional notifications are respected.
- [ ] Notifications are not sent before the relevant event actually occurs.

### Exit criteria

Important challenge events reliably create appropriate notifications without duplicates or excessive messaging.

## 10. Phase 6 — End-of-challenge review and final results

**Objective:** Ensure a challenge ends fairly and official results are not silently changed.

### Tasks

- [ ] Stop accepting scoring activities after the configured cutoff, allowing only explicitly permitted late processing.
- [ ] Move the challenge into a review state where appropriate.
- [ ] Reconcile activities and scores.
- [ ] Flag suspicious submissions for review.
- [ ] Provide an admin process to investigate reports and disputes.
- [ ] Define a dispute window and communication method.
- [ ] Finalize rankings using the documented tie-break rule.
- [ ] Lock official results after finalization.
- [ ] Record any later correction as an audited adjustment.
- [ ] Publish results and notify participants.
- [ ] Preserve completed challenge details and leaderboard history.

### Tests

- [ ] Challenge cannot finalize before the configured end/review rules permit it.
- [ ] A repeated finalization request is safe.
- [ ] Scores cannot change silently after finalization.
- [ ] Authorized corrections leave an audit trail.
- [ ] Cancelled challenges do not produce ordinary winners unless the policy explicitly says so.
- [ ] Participants receive the correct final result.

### Exit criteria

Every completed challenge has a reproducible final result, and changes are controlled and auditable.

## 11. Phase 7 — Admin and organizer operations

**Objective:** Allow authorized people to run challenges safely.

### Minimum admin capabilities

- [ ] Create and edit drafts.
- [ ] Publish, cancel, and manage challenge status.
- [ ] View participant lists and counts.
- [ ] Inspect activity/score evidence.
- [ ] Review flagged activity and disputes.
- [ ] Apply documented score corrections with a reason.
- [ ] Finalize and publish results.
- [ ] View notification delivery failures.
- [ ] View reward status if rewards are enabled.

### Security requirements

- [ ] Enforce roles and permissions on the server, not only by hiding UI controls.
- [ ] Record important administrative actions.
- [ ] Prevent ordinary users from editing official scores, winners, or reward states.
- [ ] Protect personal information and limit access to what an administrator needs.

### Exit criteria

An authorized administrator can operate the challenge lifecycle without direct database editing for normal tasks.

## 12. Phase 8 — Badges and non-cash rewards

**Objective:** Add engagement without introducing premature payment complexity.

### Tasks

- [ ] Define achievements such as participation, completion, personal best, and placement.
- [ ] Decide which achievements are automatic and which require review.
- [ ] Prevent duplicate awards.
- [ ] Store award date and the challenge or activity that earned it.
- [ ] Display earned achievements on the relevant profile/challenge screens.
- [ ] For sponsored rewards, record sponsor, reward description, quantity, eligibility, claim deadline, and delivery status.
- [ ] Define how unavailable or unclaimed rewards are handled.

### Exit criteria

Badges and any enabled non-cash rewards are awarded once, have clear eligibility rules, and can be audited.

## 13. Phase 9 — Cash prizes and entry fees (deferred)

**Do not start this phase until the free challenge flow has passed release tests.**

Before implementation:

- [ ] Obtain legal and tax advice for the intended jurisdictions and challenge format.
- [ ] Confirm applicable payment-provider policies and permitted use cases.
- [ ] Define prize funding, refunds, cancellations, winner verification, and disputes.
- [ ] Define accounting and audit requirements.
- [ ] Design secure payout and reconciliation flows.
- [ ] Add idempotent payment operations and protected webhook handling.
- [ ] Add operational monitoring and a manual recovery process.
- [ ] Test in a provider-approved sandbox before any real transactions.

Do not describe a prize as guaranteed unless it is funded and the terms clearly explain the conditions.

## 14. Phase 10 — End-to-end quality assurance

Test the complete user journey on both backend and Android.

### Core scenarios

- [ ] Organizer creates and publishes a challenge.
- [ ] User discovers it and reads the rules.
- [ ] User joins and sees the correct state.
- [ ] User records an eligible activity.
- [ ] The backend validates and scores the activity.
- [ ] The leaderboard updates correctly.
- [ ] A second user participates and rankings change correctly.
- [ ] The challenge reaches its end time.
- [ ] Review and finalization work.
- [ ] Results appear in the app.
- [ ] Notifications are created and delivered as expected.
- [ ] Completed challenge history remains available.

### Negative and edge scenarios

- [ ] Logged-out requests.
- [ ] Duplicate join and activity requests.
- [ ] Expired registration and challenge windows.
- [ ] Invalid or missing challenge data.
- [ ] Network loss and retry behavior.
- [ ] Concurrent participant joins.
- [ ] Suspicious GPS/activity data.
- [ ] Challenge cancellation.
- [ ] Backend/database outage.
- [ ] Notification delivery failure.
- [ ] App restart during joining or activity submission.
- [ ] Unauthorized administrative requests.

### Operational checks

- [ ] Database migrations are reviewed and backed up appropriately.
- [ ] TypeScript checks pass.
- [ ] Existing relevant tests pass.
- [ ] New tests cover the implemented behavior.
- [ ] Android release build succeeds.
- [ ] API smoke tests pass in the intended environment.
- [ ] Logs contain enough diagnostic detail without exposing secrets.
- [ ] Production environment variables and permissions are checked.
- [ ] Rollback steps are documented.
- [ ] No unresolved critical or high-severity issue remains.

## 15. Suggested implementation order

Follow this order. Do not skip ahead to rewards or polish while the core data flow is unverified.

1. **Audit current code and database.**
2. **Document lifecycle, eligibility, and scoring rules.**
3. **Fix registration and participation correctness.**
4. **Connect validated activities to server-side scores.**
5. **Verify leaderboard calculations and tie rules.**
6. **Implement end-of-challenge review and finalization.**
7. **Add in-app notifications; then push notifications.**
8. **Build the minimum admin workflow.**
9. **Add badges and optional sponsored rewards.**
10. **Run end-to-end and regression tests.**
11. **Deploy carefully and verify production behavior.**
12. **Consider cash prizes only after separate compliance and operational review.**

The precise work items within each phase must be adjusted to the audit findings. Existing, verified functionality should be retained rather than rewritten.

## 16. Completion tracker

Update this tracker with evidence after each phase.

| Phase | Status | Evidence / notes |
|---|---|---|
| 0. Existing implementation audit | Not started | |
| 1. Lifecycle and rules | Not started | |
| 2. Registration and participation | Not started | |
| 3. Activity validation and scoring | Not started | |
| 4. Leaderboard and progress | Not started | |
| 5. Notifications | Not started | |
| 6. Review and final results | Not started | |
| 7. Admin/organizer operations | Not started | |
| 8. Badges/non-cash rewards | Not started | |
| 9. Cash prizes/entry fees | Deferred | Compliance review required |
| 10. End-to-end QA | Not started | |
| 11. Production rollout | Not started | |

### Status definitions

- **Not started:** Work has not begun.
- **In progress:** Implementation or testing is underway.
- **Blocked:** A dependency or issue prevents progress.
- **Done:** Implementation and relevant tests have passed, with evidence recorded.
- **Deferred:** Deliberately excluded from the current release.

Do not mark a phase Done because code was written or the app compiled. Mark it Done only when the acceptance criteria have been tested.

## 17. Definition of success

The first release of the Challenge module is ready when:

- [ ] Users can discover challenges and understand the rules before joining.
- [ ] Joining and withdrawal obey the published policy.
- [ ] Only eligible, validated activities affect scores.
- [ ] Duplicate requests cannot create duplicate participation or points.
- [ ] Rankings and ties follow documented rules.
- [ ] Challenge end, review, and result finalization work reliably.
- [ ] Participants receive the intended notifications without duplicates.
- [ ] Authorized administrators can investigate issues and manage results.
- [ ] Critical actions are protected by backend authorization.
- [ ] Tests cover both normal and failure scenarios.
- [ ] Android and backend checks pass in the release environment.
- [ ] Production rollout and rollback procedures are documented.
- [ ] No unresolved critical/high-severity release blocker remains.

This roadmap is the plan, not a claim that the current code already meets these requirements. The audit determines what is complete, what needs repair, and what still needs to be built.
