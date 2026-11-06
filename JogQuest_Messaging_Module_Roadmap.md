# JogQuest Messaging Module --- Completion Roadmap

**Project:** JogQuest\
**Module:** Direct Messaging\
**Status:** In progress\
**Execution rule:** Complete the implementation phases in order. Do not
start the dedicated verification and testing phase until all planned
implementation work is finished.

------------------------------------------------------------------------

## 1. Objective

Complete a reliable, polished, secure direct-messaging experience that
fits JogQuest's existing social platform and black modern UI.

The module should let users discover and start conversations, exchange
messages, understand message status, manage conversations, and safely
interact with other users.

### Scope principles

-   Continue from the existing implementation; do not rebuild working
    infrastructure.
-   Preserve the existing React Native, Express/TypeScript, and
    PostgreSQL architecture.
-   Reuse the existing messaging migration, routes, navigation,
    authentication, blocking, and notification infrastructure where
    appropriate.
-   Add or change database migrations only when required by a feature.
-   Keep the mobile app and backend behavior consistent.
-   Keep verification and testing as the final roadmap phase.

------------------------------------------------------------------------

## 2. Existing work to retain

The following work has been recorded in the project history. Treat it as
existing implementation to inspect and build upon, not as proof that
every related feature is complete.

-   Messaging database migration:
    `server/src/db/migrations/003_messaging.sql`
-   Messaging backend route: `server/src/routes/messaging.ts`
-   Messaging navigation integration.
-   Basic conversation screen and message composer.
-   Conversation/message database infrastructure.
-   Blocking infrastructure.
-   Existing authentication and notification infrastructure.

**Implementation rule:** Before changing an existing area, inspect its
current code and schema. Extend it in place where possible. Do not
recreate tables, endpoints, screens, or functionality that already
exist.

------------------------------------------------------------------------

# Implementation Roadmap

## Phase 1 --- Complete core conversation management

**Goal:** Make the basic conversation lifecycle complete and consistent.

### 1.1 Conversation creation and retrieval

-   [ ] Support starting a conversation from a user's profile.
-   [ ] Reuse an existing one-to-one conversation instead of creating
    duplicates.
-   [ ] Create a conversation only when one does not already exist.
-   [ ] Retrieve the authenticated user's conversation list.
-   [ ] Return the latest message and its timestamp for each
    conversation.
-   [ ] Return unread-message counts per conversation.
-   [ ] Sort conversations by latest activity.
-   [ ] Handle users with no conversations using a proper empty state.

### 1.2 Conversation list UI

-   [ ] Build/refine the messaging inbox screen.
-   [ ] Display the other participant's avatar and display name.
-   [ ] Display the latest message preview.
-   [ ] Display the latest activity time.
-   [ ] Display unread counts.
-   [ ] Visually distinguish unread conversations.
-   [ ] Add loading, empty, and error states.
-   [ ] Support opening a conversation from the list.
-   [ ] Refresh the list after sending or receiving a message.

### 1.3 Conversation access and lifecycle

-   [ ] Ensure only conversation participants can retrieve a
    conversation.
-   [ ] Prevent unauthorized users from reading or modifying
    conversation data.
-   [ ] Define consistent behavior for blocked users.
-   [ ] Handle unavailable, deleted, or deactivated accounts gracefully.
-   [ ] Establish a consistent conversation ordering and identity model.

------------------------------------------------------------------------

## Phase 2 --- Complete the core messaging experience

**Goal:** Make one-to-one text messaging reliable and intuitive.

### 2.1 Message delivery

-   [ ] Send text messages.
-   [ ] Retrieve messages for a conversation.
-   [ ] Persist messages in PostgreSQL.
-   [ ] Return messages in a consistent chronological order.
-   [ ] Support cursor-based or otherwise efficient message pagination.
-   [ ] Load older messages without disrupting the current scroll
    position.
-   [ ] Prevent accidental duplicate submissions.
-   [ ] Handle empty messages and enforce message-length limits.
-   [ ] Preserve message content safely and consistently.

### 2.2 Chat screen UI

-   [ ] Refine incoming and outgoing message bubbles.
-   [ ] Group consecutive messages from the same sender.
-   [ ] Display timestamps.
-   [ ] Add date separators.
-   [ ] Distinguish incoming and outgoing messages.
-   [ ] Scroll to the latest message when opening a conversation, where
    appropriate.
-   [ ] Preserve scroll position when older messages are loaded.
-   [ ] Add loading, empty, and error states.
-   [ ] Ensure the message list works correctly with the mobile
    keyboard.
-   [ ] Support multiline message composition.
-   [ ] Enable the send action only when the message is valid.
-   [ ] Show a sending state while a message is being submitted.
-   [ ] Show a failed state and provide a retry action when sending
    fails.

### 2.3 Message status

-   [ ] Define message delivery states.
-   [ ] Display sent status.
-   [ ] Display delivered status if delivery tracking is implemented.
-   [ ] Display read status.
-   [ ] Ensure status changes are persisted and associated with the
    correct recipient.
-   [ ] Avoid showing a read receipt before the message has actually
    been read.

------------------------------------------------------------------------

## Phase 3 --- Real-time messaging

**Goal:** Allow conversations to update without manual refresh.

### 3.1 Real-time infrastructure

-   [ ] Select and implement the real-time transport, preferably
    WebSockets if compatible with the current hosting and backend
    architecture.
-   [ ] Authenticate real-time connections.
-   [ ] Authorize conversation subscriptions on the server.
-   [ ] Join and leave conversation channels safely.
-   [ ] Broadcast new messages only to authorized participants.
-   [ ] Persist messages before treating them as successfully sent.
-   [ ] Handle disconnects and reconnections.
-   [ ] Prevent duplicate message rendering after reconnecting.
-   [ ] Keep PostgreSQL as the source of truth.

### 3.2 Live conversation behavior

-   [ ] Receive new messages while a conversation is open.
-   [ ] Update the inbox preview when a new message arrives.
-   [ ] Update unread counts.
-   [ ] Synchronize message status changes.
-   [ ] Keep message ordering consistent.
-   [ ] Handle the sender and recipient being online simultaneously.
-   [ ] Handle the recipient being offline.
-   [ ] Reconcile missed messages after reconnecting.

### 3.3 Typing indicators

-   [ ] Emit typing-start events.
-   [ ] Emit typing-stop events.
-   [ ] Display the other participant's typing status.
-   [ ] Automatically expire stale typing indicators.
-   [ ] Avoid persisting typing events as chat messages.
-   [ ] Avoid excessive event broadcasting.

### 3.4 Presence

-   [ ] Track online/offline presence if supported by the selected
    infrastructure.
-   [ ] Display online status in the conversation header.
-   [ ] Display last-seen information when appropriate.
-   [ ] Avoid exposing presence where privacy settings or blocking rules
    prohibit it.
-   [ ] Handle multiple active sessions for the same account.

------------------------------------------------------------------------

## Phase 4 --- Message interactions

**Goal:** Add useful message-level interactions after core messaging is
complete.

### 4.1 Reply to messages

-   [ ] Add reply action to an individual message.
-   [ ] Display the referenced message preview.
-   [ ] Navigate to the original message where practical.
-   [ ] Handle replies when the referenced message is unavailable.

### 4.2 Message reactions

-   [ ] Add reactions to messages.
-   [ ] Support adding and removing a reaction.
-   [ ] Prevent duplicate reactions by the same user where the design
    expects one reaction per type.
-   [ ] Display reaction counts and participants where appropriate.
-   [ ] Synchronize reactions in real time.

### 4.3 Edit and delete messages

-   [ ] Define whether editing is allowed and establish an edit-time
    policy.
-   [ ] Allow users to edit only their own eligible messages.
-   [ ] Show that a message was edited.
-   [ ] Allow users to delete their own messages.
-   [ ] Define whether deletion is for the sender only or for all
    participants.
-   [ ] Preserve appropriate audit/history behavior if required.
-   [ ] Synchronize edits and deletions across active clients.

### 4.4 Message selection and actions

-   [ ] Add a message action menu.
-   [ ] Support copy message text.
-   [ ] Support reply, react, edit, and delete according to permissions.
-   [ ] Provide clear confirmation for destructive actions.

------------------------------------------------------------------------

## Phase 5 --- Attachments and rich messaging

**Goal:** Extend text messaging with carefully controlled media support.

### 5.1 Image attachments

-   [ ] Decide on the storage provider and upload architecture.
-   [ ] Define supported image formats and maximum file size.
-   [ ] Upload images securely.
-   [ ] Validate file type and size on the backend.
-   [ ] Store attachment metadata in PostgreSQL.
-   [ ] Display image previews in the conversation.
-   [ ] Support upload progress and failure states.
-   [ ] Prevent unauthorized access to private attachments.
-   [ ] Define retention and deletion behavior.

### 5.2 Attachment experience

-   [ ] Add an attachment action to the composer.
-   [ ] Add image preview before sending.
-   [ ] Allow cancellation before upload/send.
-   [ ] Display attachment loading and failure states.
-   [ ] Handle unavailable or expired media.
-   [ ] Keep the composer usable on small screens.

### 5.3 Later enhancements

-   [ ] Consider video attachments only after image messaging is stable.
-   [ ] Consider voice messages only if they provide clear value to
    JogQuest.
-   [ ] Consider document sharing only if there is a product
    requirement.

------------------------------------------------------------------------

## Phase 6 --- Conversation management

**Goal:** Give users control over their inbox and conversations.

-   [ ] Add conversation mute/unmute.
-   [ ] Add archive/unarchive if the product requires it.
-   [ ] Define conversation deletion behavior.
-   [ ] Keep deletion semantics clear: local hiding versus deletion for
    all participants.
-   [ ] Add unread/read conversation controls if required.
-   [ ] Add a conversation details screen or action sheet.
-   [ ] Provide access to the participant's profile.
-   [ ] Add clear confirmation for destructive actions.
-   [ ] Ensure inbox state updates after each action.

------------------------------------------------------------------------

## Phase 7 --- Privacy, blocking, and moderation

**Goal:** Make messaging safe and enforce social-platform rules
consistently.

### 7.1 Blocking enforcement

-   [ ] Integrate the existing block system with every messaging entry
    point.
-   [ ] Prevent blocked users from starting new conversations where
    policy requires.
-   [ ] Prevent message sending between users when either direction is
    blocked, according to the chosen policy.
-   [ ] Prevent real-time delivery to blocked participants.
-   [ ] Apply the same rules to REST endpoints and WebSocket events.
-   [ ] Define what happens to existing conversations after a block.
-   [ ] Ensure unblock behavior is consistent.
-   [ ] Avoid leaking private information through error responses.

### 7.2 Reporting and moderation

-   [ ] Allow users to report a message.
-   [ ] Allow users to report a conversation or participant.
-   [ ] Capture report reason and relevant context.
-   [ ] Add backend persistence for reports.
-   [ ] Define moderation status and resolution workflow.
-   [ ] Restrict access to reports to authorized moderators/admins.
-   [ ] Avoid exposing reporter identity unnecessarily.

### 7.3 Privacy and abuse prevention

-   [ ] Enforce authentication on all messaging endpoints.
-   [ ] Enforce participant-level authorization.
-   [ ] Validate all request payloads.
-   [ ] Add rate limits for conversation creation and message sending.
-   [ ] Apply message length and attachment limits.
-   [ ] Prevent user ID or conversation ID manipulation from granting
    access.
-   [ ] Avoid logging message bodies, credentials, or private attachment
    URLs unnecessarily.
-   [ ] Define data retention and account-deletion behavior.

------------------------------------------------------------------------

## Phase 8 --- Notifications and unread experience

**Goal:** Connect messaging to JogQuest's existing notification system.

-   [ ] Create an in-app notification for a new message when
    appropriate.
-   [ ] Avoid creating redundant notifications while the recipient is
    actively viewing the conversation.
-   [ ] Add push notifications for backgrounded or offline recipients.
-   [ ] Include safe, minimal notification content.
-   [ ] Respect user notification preferences.
-   [ ] Ensure blocked users cannot trigger message notifications.
-   [ ] Deep-link a notification to the correct conversation.
-   [ ] Update unread counts when a conversation is opened and messages
    are read.
-   [ ] Keep notification state and message read state consistent.
-   [ ] Handle notification permission denial gracefully.

------------------------------------------------------------------------

## Phase 9 --- Final UI and UX polish

**Goal:** Bring all messaging screens to a consistent production-quality
experience.

### 9.1 Inbox

-   [ ] Refine conversation row spacing and hierarchy.
-   [ ] Improve avatar and fallback-avatar presentation.
-   [ ] Improve unread indicators.
-   [ ] Improve latest-message previews.
-   [ ] Add suitable empty, loading, and error states.
-   [ ] Add pull-to-refresh if appropriate.

### 9.2 Conversation screen

-   [ ] Refine the chat header.
-   [ ] Make the participant profile accessible from the header.
-   [ ] Add online/last-seen status where permitted.
-   [ ] Move secondary actions into a clear menu.
-   [ ] Improve message bubble spacing and typography.
-   [ ] Improve timestamp and read-receipt presentation.
-   [ ] Refine the empty-conversation state.
-   [ ] Refine the multiline composer and attachment controls.
-   [ ] Ensure the keyboard and safe-area behavior are correct.
-   [ ] Maintain JogQuest's black modern visual theme.

### 9.3 Accessibility and usability

-   [ ] Use readable text contrast.
-   [ ] Provide accessible labels for icon-only controls.
-   [ ] Ensure touch targets are large enough.
-   [ ] Avoid relying on color alone to communicate message status.
-   [ ] Handle long names and long messages gracefully.
-   [ ] Support small screens and different font scales.
-   [ ] Provide clear feedback for user actions.

------------------------------------------------------------------------

# Phase 10 --- Final verification and testing

**This phase must be done LAST. Do not treat individual implementation
phases as the project-wide verification stage.** Once all implementation
phases are complete, perform a consolidated verification and testing
pass across the entire messaging module.

## 10.1 Static and build verification

-   [ ] Run mobile TypeScript checks.
-   [ ] Run backend TypeScript checks.
-   [ ] Run lint checks.
-   [ ] Run the mobile build.
-   [ ] Run the backend build.
-   [ ] Resolve all messaging-related build errors.
-   [ ] Check for unused routes, imports, and obsolete code introduced
    during implementation.

## 10.2 Database verification

-   [ ] Review all messaging migrations in execution order.
-   [ ] Confirm the database schema matches the application code.
-   [ ] Verify foreign keys, unique constraints, and indexes.
-   [ ] Verify message and conversation relationships.
-   [ ] Verify read-state and reaction constraints.
-   [ ] Verify attachment and report metadata constraints where
    implemented.
-   [ ] Confirm migration behavior on a clean database and an existing
    development database.

## 10.3 API and authorization testing

-   [ ] Test conversation creation and duplicate prevention.
-   [ ] Test conversation list and pagination.
-   [ ] Test message sending and retrieval.
-   [ ] Test invalid and empty message payloads.
-   [ ] Test unauthorized conversation access.
-   [ ] Test participant ownership enforcement.
-   [ ] Test block enforcement on every relevant endpoint.
-   [ ] Test rate limits and validation.
-   [ ] Test report and moderation permissions.
-   [ ] Test attachment authorization and validation where implemented.

## 10.4 Real-time testing

-   [ ] Test message delivery between two accounts.
-   [ ] Test simultaneous messages.
-   [ ] Test typing indicators.
-   [ ] Test read receipts.
-   [ ] Test online/offline transitions.
-   [ ] Test disconnect and reconnect behavior.
-   [ ] Test duplicate-event prevention.
-   [ ] Test offline message reconciliation.
-   [ ] Test blocked-user behavior over real-time connections.

## 10.5 Mobile UI and device testing

-   [ ] Test the complete inbox-to-conversation flow.
-   [ ] Test empty, loading, error, and populated states.
-   [ ] Test keyboard opening and closing.
-   [ ] Test long conversations and pagination.
-   [ ] Test message sending failures and retries.
-   [ ] Test attachments on supported devices.
-   [ ] Test navigation away from and back to a conversation.
-   [ ] Test notification deep links.
-   [ ] Test safe areas, screen sizes, and font scaling.

## 10.6 End-to-end scenarios

-   [ ] User A opens User B's profile and starts a conversation.
-   [ ] The app reuses the existing conversation on subsequent attempts.
-   [ ] User A sends a message and User B receives it.
-   [ ] User B replies and User A receives the reply.
-   [ ] Read status updates correctly.
-   [ ] Unread count changes correctly.
-   [ ] User B receives an appropriate notification when not viewing the
    conversation.
-   [ ] A blocked user cannot bypass restrictions through another
    endpoint or real-time connection.
-   [ ] Message edit, delete, reply, and reaction behavior works
    according to permissions.
-   [ ] Attachment upload and access work according to privacy rules.
-   [ ] Reporting creates a moderation record accessible only to
    authorized staff.

## 10.7 Final release checklist

-   [ ] No unresolved critical or high-severity messaging defects.
-   [ ] No unauthorized conversation or attachment access.
-   [ ] No duplicate conversation or message behavior.
-   [ ] No broken navigation or notification deep links.
-   [ ] No unhandled real-time connection failures.
-   [ ] No migration or deployment dependency is missing.
-   [ ] Document environment variables and deployment requirements.
-   [ ] Document the messaging API and real-time event contract.
-   [ ] Confirm production logging does not expose private message
    content.
-   [ ] Mark the messaging module complete only after the full
    verification pass.

------------------------------------------------------------------------

## 3. Recommended implementation order

    Order Phase      Focus
  ------- ---------- --------------------------------
        1 Phase 1    Core conversation management
        2 Phase 2    Core messaging experience
        3 Phase 3    Real-time messaging
        4 Phase 4    Message interactions
        5 Phase 5    Attachments and rich messaging
        6 Phase 6    Conversation management
        7 Phase 7    Privacy, blocking, moderation
        8 Phase 8    Notifications
        9 Phase 9    UI/UX polish
       10 Phase 10   Final verification and testing

## 4. Definition of completion

The JogQuest Messaging Module is complete when:

1.  Users can reliably start, retrieve, and manage one-to-one
    conversations.
2.  Users can exchange messages with correct persistence and ordering.
3.  Real-time delivery, reconnection, and offline reconciliation behave
    consistently.
4.  Message interactions and attachments work according to defined
    permissions.
5.  Blocking, privacy, reporting, and abuse-prevention rules are
    enforced across REST and real-time paths.
6.  Notifications and unread counts remain synchronized.
7.  The mobile experience is polished and consistent with JogQuest.
8.  The final consolidated verification and testing phase passes.

**Execution note:** Work phase by phase. Preserve existing code, avoid
unrelated refactors, and defer the dedicated verification/testing pass
until Phase 10.
