# JogQuest Club Module --- Development Roadmap

**Project:** JogQuest\
**Module:** Clubs / Running Communities\
**Document status:** Development baseline\
**Approach:** Incremental implementation, phase-by-phase, with explicit
acceptance criteria and verification gates.

------------------------------------------------------------------------

## 1. Product vision

JogQuest Clubs are running communities built around **shared activity,
motivation, friendly competition, and collective progress**.

A Club is more than a member list or a Facebook-style discussion group.
It should connect the social experience to JogQuest's core running and
territory gameplay.

A member should be able to:

1.  Discover and join a community.
2.  See what is happening in that community.
3.  Share running progress and interact with other members.
4.  Participate in club challenges and collective goals.
5.  Compare progress on club leaderboards.
6.  Eventually organise real-world group runs and events.

### Product principles

-   **Running-first:** Posts and interactions should support running,
    not turn Clubs into a generic social network.
-   **Gameplay-connected:** Use existing JogQuest activities, challenge
    records, and territory systems wherever appropriate.
-   **Trustworthy scoring:** Progress, rankings, and rewards must be
    calculated or validated server-side.
-   **Privacy-aware:** Respect activity visibility, profile privacy,
    blocks, and club visibility.
-   **Useful for small clubs:** A club with only a few members should
    still feel understandable and worthwhile.
-   **Incremental delivery:** Complete and verify one phase before
    starting the next.
-   **No duplicate sources of truth:** A shared activity post references
    the original activity; it does not create another activity record.

------------------------------------------------------------------------

## 2. Target Club experience

### Club Home

The existing Club Details screen should evolve into a Club Home with
four primary destinations:

1.  **Feed** --- posts, shared runs, comments, likes, and announcements.
2.  **Challenges** --- active and completed club challenges.
3.  **Leaderboard** --- member rankings for defined periods and metrics.
4.  **Members** --- member directory, profiles, and role information.

The Club Home header should retain the club identity, description,
visibility, creator/owner information, member count, and relevant
management actions.

The Feed should be the default destination when a member opens a club.

### Core member journey

1.  A member opens their club and sees recent activity.
2.  They react to or comment on a post.
3.  They complete a JogQuest run.
4.  If the activity is eligible and shareable, it appears in the club
    feed.
5.  The validated activity contributes to eligible club challenge and
    leaderboard totals.
6.  The member sees progress and encouragement from the community.
7.  They return to help the club reach its next goal.

------------------------------------------------------------------------

## 3. Scope and boundaries

### Included in this Club roadmap

-   Club home and navigation
-   Club feed and posts
-   Shared JogQuest activity posts
-   Likes and comments
-   Club announcements and moderation
-   Member directory and club roles
-   Club challenges and collective goals
-   Club leaderboards and historical periods
-   Club events and group runs
-   Notifications and privacy integration
-   Reporting, safety, reliability, and production readiness

### Existing functionality to preserve

The project already has a Club foundation in the mobile app, including
work for:

-   Creating clubs
-   Public/private visibility
-   Joining and leaving clubs
-   Club details
-   Member listing
-   Owner display

Treat these as existing functionality, not as permission to rewrite
them. Inspect the current code and database before changing anything.
Some related workflows, such as private join approvals and complete role
permissions, may still need implementation or verification.

### Out of scope for the initial Club release

-   A general-purpose Facebook clone
-   Direct messaging inside Clubs (use the separate JogQuest messaging
    module)
-   Payments, subscriptions, or paid memberships
-   Complex club chapters/franchises
-   Live audio/video rooms
-   Unverified activity imports or client-trusted scoring
-   Advanced event ticketing

------------------------------------------------------------------------

## 4. Roles and permissions

Start with three roles.

  -----------------------------------------------------------------------
  Role                                Responsibilities and permissions
  ----------------------------------- -----------------------------------
  Owner                               Full club control; edit club
                                      details; manage roles; manage
                                      membership; transfer ownership;
                                      delete club

  Admin                               Manage members; review join
                                      requests; moderate club content;
                                      create and manage club challenges;
                                      publish announcements

  Member                              View permitted club content; create
                                      permitted posts; react and comment;
                                      join eligible challenges;
                                      participate in club activities
  -----------------------------------------------------------------------

### Permission rules

-   A club must always have one valid owner.
-   Only the owner can transfer ownership or delete the club.
-   Admins cannot promote themselves to owner.
-   Members cannot perform owner/admin actions.
-   Private club content must not be visible to non-members.
-   A private join request must not grant membership until approved.
-   Leaving a club must remove access to member-only content and
    participation actions.
-   Removing or banning a member must invalidate their access promptly.
-   Permission checks must be enforced by the backend, not only by
    hiding mobile UI controls.

**Acceptance criteria**

-   Role permissions are documented and tested.
-   Unauthorized API requests fail safely.
-   Ownership cannot accidentally be left empty.
-   Role changes and moderation actions are auditable.

------------------------------------------------------------------------

# 5. Phased development plan

## Phase 0 --- Audit and implementation planning

**Goal:** Establish the exact current state before modifying the Club
module.

### Tasks

-   [ ] Inspect current mobile Club screens and navigation.
-   [ ] Inspect club-related backend routes, services, and validation.
-   [ ] Inspect current database schema and migrations for clubs and
    memberships.
-   [ ] Identify existing social post, activity, profile, notification,
    challenge, and territory models.
-   [ ] Identify existing authorization, privacy, block, and report
    mechanisms.
-   [ ] Map current API contracts to the mobile screens.
-   [ ] Identify duplicate or overlapping functionality that should be
    reused.
-   [ ] Record gaps, dependencies, and migration risks.
-   [ ] Agree the implementation sequence and exact files to change.

### Deliverables

-   Current-state inventory
-   Club data-flow/API map
-   Gap list
-   Dependency list
-   Phase implementation checklist

### Exit criteria

-   [ ] Relevant code and schema have been inspected.
-   [ ] No assumptions remain about existing tables, endpoints, or
    component behaviour.
-   [ ] Reuse opportunities and required changes are documented.
-   [ ] No unrelated refactoring is included.

------------------------------------------------------------------------

## Phase 1 --- Club Home foundation

**Goal:** Turn the current Club Details screen into a navigable Club
Home without breaking existing create/join flows.

### Mobile tasks

-   [ ] Establish Club Home screen structure.
-   [ ] Add navigation for Feed, Challenges, Leaderboard, and Members.
-   [ ] Make Feed the default tab.
-   [ ] Preserve club name, description, visibility, owner, and member
    count.
-   [ ] Add loading, empty, error, and retry states.
-   [ ] Add appropriate navigation for owners, admins, and members.
-   [ ] Ensure small screens and long club names/descriptions render
    correctly.

### Backend/data tasks

-   [ ] Reuse existing club and membership APIs where suitable.
-   [ ] Add only the missing summary/detail fields needed by Club Home.
-   [ ] Enforce membership and private-club access rules.
-   [ ] Avoid introducing duplicate club or membership records.

### Acceptance criteria

-   [ ] Existing create, join, leave, and details flows still work.
-   [ ] A member can open the Club Home and navigate between all four
    sections.
-   [ ] A non-member cannot access private club content through direct
    API calls.
-   [ ] Empty sections show helpful empty states rather than broken or
    blank screens.
-   [ ] Loading and API failure states are handled.

------------------------------------------------------------------------

## Phase 2 --- Club Feed and social interaction

**Goal:** Make Clubs feel active through posts and meaningful member
interaction.

### 2.1 Feed foundations

-   [ ] Create a paginated, newest-first club feed.
-   [ ] Define supported post types: text, activity share, and
    announcement.
-   [ ] Display author, timestamp, content, and relevant post details.
-   [ ] Add pull-to-refresh and pagination/infinite loading.
-   [ ] Add empty, loading, error, and retry states.
-   [ ] Define content length and media rules before adding media
    uploads.
-   [ ] Prevent duplicate feed entries when clients retry requests.

### 2.2 Text posts

-   [ ] Allow eligible members to create text posts.
-   [ ] Validate content on the backend.
-   [ ] Allow authors to edit or delete their own posts according to
    policy.
-   [ ] Allow admins/owners to remove content under moderation rules.
-   [ ] Preserve attribution and timestamps.

### 2.3 Shared running activities

-   [ ] Allow a completed eligible JogQuest activity to be shared to a
    club.
-   [ ] Reference the existing activity record; do not duplicate the
    activity.
-   [ ] Respect the activity owner's sharing and privacy settings.
-   [ ] Show only approved summary fields, such as distance, duration,
    pace, and completion time, when available and permitted.
-   [ ] Do not expose private routes, precise GPS traces, or sensitive
    location data by default.
-   [ ] Define what happens if an activity is deleted, hidden, or made
    private later.
-   [ ] Prevent duplicate shares for the same activity and club where
    policy requires it.

### 2.4 Likes and comments

-   [ ] Add and remove likes.
-   [ ] Show like counts and, where appropriate, who reacted.
-   [ ] Add paginated comments.
-   [ ] Allow comment authors to edit/delete their own comments
    according to policy.
-   [ ] Allow admins/owners to moderate comments.
-   [ ] Prevent duplicate likes and duplicate comment submissions.
-   [ ] Handle deleted posts and comments consistently.

### 2.5 Announcements

-   [ ] Allow owners/admins to publish announcements.
-   [ ] Visually distinguish announcements from ordinary posts.
-   [ ] Support pinning one or more important announcements with a
    defined limit.
-   [ ] Allow authorized users to unpin or remove announcements.
-   [ ] Ensure announcement permissions are backend-enforced.

### Acceptance criteria

-   [ ] Members can create and view permitted posts.
-   [ ] Likes and comments persist correctly and update consistently.
-   [ ] Feed pagination does not skip or duplicate posts under normal
    use.
-   [ ] Shared activities use the original activity as their source of
    truth.
-   [ ] Private activity details are not leaked.
-   [ ] Admin moderation works through authorized backend actions.
-   [ ] Feed remains usable for an empty club and a busy club.

------------------------------------------------------------------------

## Phase 3 --- Members, profiles, and club administration

**Goal:** Make it easy to understand who belongs to a club and give club
managers the tools to run it.

### Member experience

-   [ ] Build a paginated member directory.
-   [ ] Display member avatar, display name, username, and club role.
-   [ ] Open a member's profile.
-   [ ] Show only profile and activity information allowed by privacy
    settings.
-   [ ] Integrate existing follow/unfollow functionality where
    available.
-   [ ] Show a member's club contribution using clearly defined metrics.
-   [ ] Add member search if the expected club size requires it.

### Owner/admin experience

-   [ ] View pending private-club join requests.
-   [ ] Approve or reject requests.
-   [ ] Remove members with clear confirmation.
-   [ ] Ban members if the product policy supports bans.
-   [ ] Promote/demote admins under the role rules.
-   [ ] Transfer ownership safely.
-   [ ] Edit club name, description, and visibility under defined rules.
-   [ ] View relevant moderation and membership action history.

### Acceptance criteria

-   [ ] Member lists respect pagination and privacy.
-   [ ] Only authorized roles can manage members.
-   [ ] Private join requests cannot bypass approval.
-   [ ] Role changes take effect on subsequent requests.
-   [ ] A removed/banned member loses access as intended.
-   [ ] Existing follow and profile systems are reused rather than
    duplicated.

------------------------------------------------------------------------

## Phase 4 --- Club challenges and collective goals

**Goal:** Make JogQuest Clubs distinct through team participation and
shared achievements.

### Challenge types for the first release

Start with a small, understandable set:

1.  **Collective distance:** The club aims to run a combined distance
    within a time window.
2.  **Individual contribution:** Each participating member aims to reach
    a personal distance or run-count target.
3.  **Territory goal:** Members collectively capture or hold a defined
    number of eligible territories, if the existing territory system
    supports reliable attribution.

Do not launch many challenge types before the scoring and eligibility
rules are proven.

### Challenge creation and management

-   [ ] Allow owners/admins to create club challenges.
-   [ ] Define title, description, challenge type, target, start/end
    time, and eligibility.
-   [ ] Validate dates, target values, and challenge configuration
    server-side.
-   [ ] Define whether members are automatically enrolled or must join.
-   [ ] Allow authorized admins to edit or cancel challenges under
    explicit rules.
-   [ ] Prevent invalid changes after a challenge has started, or define
    safe adjustment rules.
-   [ ] Show upcoming, active, completed, and cancelled states.

### Participation and progress

-   [ ] Allow members to join/leave where the challenge rules permit.
-   [ ] Attribute eligible activity to the correct member and club
    challenge.
-   [ ] Calculate progress server-side from trusted JogQuest records.
-   [ ] Define activity eligibility, time-zone handling, late-arriving
    records, and duplicate prevention.
-   [ ] Define how deleted, corrected, flagged, or invalidated
    activities affect progress.
-   [ ] Show individual contribution and collective progress.
-   [ ] Record completion and preserve final results.

### Rewards

-   [ ] Decide whether the first release uses badges, XP, points, or
    recognition only.
-   [ ] Reuse existing reward systems if available.
-   [ ] Never award rewards solely from client-submitted totals.
-   [ ] Define anti-cheat review and reversal behaviour before awarding
    competitive rewards.

### Acceptance criteria

-   [ ] Admins can create valid challenges.
-   [ ] Members can see and participate in eligible challenges.
-   [ ] Progress is derived from server-validated records.
-   [ ] Duplicate or ineligible activities do not inflate progress.
-   [ ] Challenge status changes correctly at start and end.
-   [ ] Final results remain available after completion.
-   [ ] Progress can be recalculated safely if an underlying activity is
    invalidated.

------------------------------------------------------------------------

## Phase 5 --- Club leaderboard and historical rankings

**Goal:** Give members a fair way to compare participation and celebrate
progress.

### Initial leaderboard categories

-   [ ] Weekly distance
-   [ ] Monthly distance
-   [ ] Weekly run count
-   [ ] Challenge contribution
-   [ ] Territory contribution, only if reliable territory attribution
    exists

### Rules and implementation

-   [ ] Define ranking periods, time zone, reset boundaries, and
    tie-break rules.
-   [ ] Use server-side validated activity and challenge data.
-   [ ] Exclude private or ineligible activity according to the agreed
    policy.
-   [ ] Define treatment of flagged, deleted, corrected, and invalidated
    activity.
-   [ ] Paginate rankings for larger clubs.
-   [ ] Show the current member's rank even when outside the first page.
-   [ ] Preserve historical period results.
-   [ ] Clearly label the metric and date range.
-   [ ] Avoid presenting incomparable metrics as one score unless a
    transparent scoring model is approved.

### Acceptance criteria

-   [ ] Rankings are deterministic for the same underlying data.
-   [ ] Tie-breaks are consistent and documented.
-   [ ] Period boundaries are correct.
-   [ ] Client changes cannot manipulate rank.
-   [ ] Historical results do not silently change except through a
    documented correction/recalculation process.

------------------------------------------------------------------------

## Phase 6 --- Club events and group runs

**Goal:** Help online clubs organise real-world running activities.

### Event features

-   [ ] Allow owners/admins to create events.
-   [ ] Define title, description, date/time, time zone, meeting point,
    and optional capacity.
-   [ ] Define event visibility and member eligibility.
-   [ ] Allow members to RSVP: Going, Interested, or Not Going.
-   [ ] Show attendee lists according to privacy settings.
-   [ ] Allow authorized admins to edit or cancel events.
-   [ ] Send event reminders through the existing notification system.
-   [ ] Show upcoming and past events.
-   [ ] Provide a safe way to share meeting-point information.

### Group-run considerations

-   [ ] Make clear that event attendance is separate from verified
    JogQuest activity.
-   [ ] Do not automatically award running distance or challenge
    progress merely for RSVP.
-   [ ] Use completed, eligible activity records for any resulting
    activity credit.
-   [ ] Avoid exposing a member's live location to the club by default.

### Acceptance criteria

-   [ ] Events display correct local date/time.
-   [ ] RSVP state is consistent and cannot be duplicated.
-   [ ] Event edits and cancellations are reflected for attendees.
-   [ ] Notifications are sent according to user preferences.
-   [ ] Location and attendee privacy rules are respected.

------------------------------------------------------------------------

## Phase 7 --- Notifications and cross-module integration

**Goal:** Connect Club activity to JogQuest notifications without
creating a second notification system.

### Potential notifications

-   [ ] New club announcement
-   [ ] Like/comment on a member's post
-   [ ] Reply to a member's comment
-   [ ] Private-club join request received
-   [ ] Join request approved/rejected
-   [ ] Member removed or role changed
-   [ ] Club challenge started or ending soon
-   [ ] Club challenge completed
-   [ ] Club event reminder or cancellation

### Integration rules

-   [ ] Reuse the existing JogQuest notification infrastructure.
-   [ ] Respect notification preferences and mute settings.
-   [ ] Avoid notifying users for every low-value event.
-   [ ] Prevent duplicate notifications from retried jobs/API requests.
-   [ ] Ensure notification deep links open the correct club and
    destination.
-   [ ] Do not duplicate direct messaging functionality.

### Acceptance criteria

-   [ ] Each notification has a clear trigger and recipient rule.
-   [ ] Duplicate notifications are prevented.
-   [ ] Deep links handle deleted or inaccessible content safely.
-   [ ] Muted clubs and user preferences are respected.

------------------------------------------------------------------------

## Phase 8 --- Safety, moderation, privacy, and reliability

**Goal:** Make Clubs safe and dependable before broad production use.

### Safety and moderation

-   [ ] Report club, post, comment, and member where appropriate.
-   [ ] Define report reasons and moderation status lifecycle.
-   [ ] Integrate existing block functionality.
-   [ ] Define how blocking affects club visibility and interactions.
-   [ ] Add rate limits for posting, commenting, reactions, and join
    requests.
-   [ ] Validate and sanitize user-generated content.
-   [ ] Prevent spam and abusive repeated actions.
-   [ ] Keep an audit trail for important admin actions.
-   [ ] Define escalation and appeal handling for moderation decisions.

### Privacy and security

-   [ ] Enforce private-club authorization on every relevant API.
-   [ ] Respect profile and activity visibility.
-   [ ] Avoid exposing precise GPS traces or sensitive location details.
-   [ ] Validate ownership and role permissions server-side.
-   [ ] Protect against IDOR and unauthorized object access.
-   [ ] Validate pagination, sorting, and filter inputs.
-   [ ] Ensure deleted or inaccessible content is handled consistently.
-   [ ] Review retention and deletion behaviour for user-generated
    content.

### Reliability and performance

-   [ ] Add appropriate database indexes based on actual query patterns.
-   [ ] Use pagination for feeds, comments, members, and leaderboards.
-   [ ] Use transactions for multi-step membership and challenge
    operations.
-   [ ] Make retryable actions idempotent where appropriate.
-   [ ] Add structured logging for important failures and moderation
    actions.
-   [ ] Avoid N+1 database queries.
-   [ ] Test empty, normal, and high-volume clubs.
-   [ ] Add monitoring for API errors and slow queries.

### Acceptance criteria

-   [ ] Authorization and privacy tests pass.
-   [ ] Report/block/moderation workflows behave as documented.
-   [ ] Rate limits and validation are active.
-   [ ] Common club screens remain responsive with larger datasets.
-   [ ] Critical failures are observable and recoverable.

------------------------------------------------------------------------

## Phase 9 --- End-to-end verification and release

**Goal:** Verify the complete Club journey and prepare it for
production.

### Functional test scenarios

-   [ ] Create a public club.
-   [ ] Create a private club.
-   [ ] Discover and join a public club.
-   [ ] Request access to a private club.
-   [ ] Approve and reject private join requests.
-   [ ] Leave a club.
-   [ ] Remove a member.
-   [ ] Change member roles.
-   [ ] Transfer ownership.
-   [ ] Create, edit, and delete a post.
-   [ ] Share an eligible activity.
-   [ ] Verify private activity information is not exposed.
-   [ ] Like and unlike a post.
-   [ ] Comment, edit, and delete a comment.
-   [ ] Publish and pin an announcement.
-   [ ] Create and complete a club challenge.
-   [ ] Verify challenge progress against source activity records.
-   [ ] Verify leaderboard ranking and tie-break rules.
-   [ ] Create an event and update RSVP.
-   [ ] Verify notifications and deep links.
-   [ ] Report content and test moderation.
-   [ ] Test blocked-user interactions.
-   [ ] Test unauthorized API calls for every privileged action.

### Technical verification

-   [ ] Apply migrations on a clean test database.
-   [ ] Verify migration safety against a database with existing data.
-   [ ] Run backend type checks and tests.
-   [ ] Run mobile lint/type checks and tests available in the project.
-   [ ] Build the mobile app.
-   [ ] Run API integration tests.
-   [ ] Run end-to-end tests for critical journeys.
-   [ ] Test slow network, offline, retry, and API failure behaviour.
-   [ ] Check logs for errors and unexpected data changes.
-   [ ] Verify production environment configuration and migration
    procedure.

### Release criteria

-   [ ] No known critical authorization, privacy, or data-integrity
    issue.
-   [ ] All phase acceptance criteria are met or explicitly deferred.
-   [ ] Existing club create/join functionality has not regressed.
-   [ ] Rollback/recovery approach is documented for schema and
    deployment changes.
-   [ ] Release notes and known limitations are documented.

------------------------------------------------------------------------

# 6. Recommended screen structure

A suggested navigation model:

``` text
Club Discovery
  ├── Search / Browse Clubs
  └── Club Details (preview for non-members)

Club Home (members)
  ├── Feed
  │   ├── Create Post
  │   ├── Activity Post
  │   ├── Post Details
  │   └── Comments
  ├── Challenges
  │   ├── Active Challenges
  │   ├── Challenge Details
  │   └── Create / Manage Challenge (owner/admin)
  ├── Leaderboard
  │   ├── Weekly
  │   ├── Monthly
  │   └── History
  └── Members
      ├── Member Profile
      └── Member Management (owner/admin)

Club Management
  ├── Edit Club
  ├── Join Requests
  ├── Roles and Members
  ├── Moderation
  └── Ownership / Delete Club

Future
  └── Events
      ├── Event Details
      └── RSVP
```

This is a product-level navigation proposal. Final routes and screen
names must follow the existing app architecture after Phase 0
inspection.

------------------------------------------------------------------------

# 7. Data and architecture principles

Do not create database tables or API endpoints solely because they
appear in this roadmap. First inspect the existing schema and reuse
existing models where appropriate.

Potential conceptual entities (not prescribed table names):

-   Club
-   Club membership and role
-   Join request
-   Club post
-   Post reaction
-   Post comment
-   Activity share/reference
-   Club challenge
-   Challenge participation/progress
-   Leaderboard period/snapshot
-   Club event and RSVP
-   Moderation report/action
-   Notification reference

### Source-of-truth rules

  Information                   Source of truth
  ----------------------------- ----------------------------------------------------------
  Club identity and settings    Club record
  Membership and roles          Membership records
  Running activity              Existing JogQuest activity record
  Territory ownership/capture   Existing territory system
  Challenge progress            Server-derived from eligible source records
  Leaderboard                   Server-derived from validated metrics
  Feed post                     Club post record referencing its source where applicable
  Notification                  Existing JogQuest notification system

### API design principles

-   Enforce authorization in backend handlers/services.
-   Validate all inputs server-side.
-   Use pagination for growing collections.
-   Use transactions for related state changes.
-   Make retryable mutations idempotent where appropriate.
-   Return consistent error shapes.
-   Avoid exposing internal database details to the mobile app.
-   Keep API contracts explicit and typed where the project supports it.

------------------------------------------------------------------------

# 8. Development rules for this roadmap

These rules apply throughout implementation.

1.  **Inspect before changing.** Obtain the exact current contents of
    relevant files and schema before proposing code changes.
2.  **Ask for files together.** Identify all files needed for a phase
    and request them in one consolidated command where practical.
3.  **Do not guess project state.** Never invent filenames, table names,
    route names, fields, endpoints, or existing behaviour.
4.  **Follow the agreed sequence.** Do not jump ahead to later phases
    without a reason and explicit agreement.
5.  **Keep changes focused.** Avoid unrelated cleanup, redesign,
    dependency upgrades, or refactoring.
6.  **Preserve working functionality.** Existing create/join/leave and
    other completed features must not regress.
7.  **Database changes require care.** Review current schema, migration
    conventions, constraints, indexes, and existing data before writing
    migrations.
8.  **Security is not a UI feature.** Enforce permissions and validation
    on the backend.
9.  **No client-trusted scoring.** Challenges and leaderboards must use
    server-validated source data.
10. **Verify each phase.** Run relevant checks and review actual outputs
    before marking work complete.
11. **Update this roadmap.** Check off completed tasks only after
    implementation and verification evidence exists.
12. **Record deferred work.** Any skipped item must be listed with a
    reason and a future phase or decision.

------------------------------------------------------------------------

# 9. Phase completion record

Update this section as implementation progresses.

  Phase                                     Status        Completion evidence / notes
  ----------------------------------------- ------------- -----------------------------
  0\. Audit and planning                    Not started   
  1\. Club Home foundation                  Not started   
  2\. Club Feed and interactions            Not started   
  3\. Members and administration            Not started   
  4\. Club challenges                       Not started   
  5\. Club leaderboard                      Not started   
  6\. Events and group runs                 Not started   
  7\. Notifications and integration         Not started   
  8\. Safety, privacy, reliability          Not started   
  9\. End-to-end verification and release   Not started   

Suggested status values: `Not started`, `In progress`, `Blocked`,
`Implemented — verification pending`, `Verified`, `Deferred`.

A phase is not complete merely because code has been written. It is
complete when its acceptance criteria have been checked and the
verification evidence is recorded.

------------------------------------------------------------------------

# 10. Immediate next step

Start with **Phase 0 --- Audit and implementation planning**.

Inspect the current Club implementation, backend APIs, database
schema/migrations, and existing activity/social/challenge/notification
systems. Then prepare a precise gap analysis and a focused Phase 1
implementation plan.

Do not modify code or schema until the relevant current contents have
been reviewed.

**First implementation milestone:** A stable Club Home with Feed,
Challenges, Leaderboard, and Members navigation, preserving all existing
create/join/leave behaviour.
