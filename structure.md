# JogQuest Deep Project Structure

This document reflects the actual workspace structure of the JogQuest repository as of 2026-10-15. It includes the app layer, server layer, native platform projects, and the detailed screen/module breakdown used by the product.

## 1) Product overview

JogQuest is a mobile activity and territory game. Users track outdoor activities, validate route loops, capture territory, and progress through social, club, and competitive flows.

### Core product loop

```text
Choose activity
  -> Record GPS route and live stats
  -> Finish activity
  -> Validate route / territory eligibility
  -> Save result
  -> Explore map, share progress, and compete
  -> Start another activity
```

### Main product domains

- Identity and profile
- Activity tracking
- Territory gameplay
- Social feed and follows
- Clubs and competitions
- Route planning and integrations

---

## 2) Deep repository tree

```text
JogQuest/
├── .bundle/
├── .env
├── .eslintrc.js
├── .git/
├── .gitignore
├── .prettierrc.js
├── .watchmanconfig
├── App.tsx
├── Gemfile
├── README.md
├── app.json
├── babel.config.js
├── index.js
├── jest.config.js
├── metro.config.js
├── package-lock.json
├── package.json
├── tsconfig.json
├── structure.md
├── __tests__/
│   └── App.test.tsx
├── android/
│   ├── .gradle/
│   ├── .kotlin/
│   ├── app/
│   │   ├── build.gradle
│   │   ├── proguard-rules.pro
│   │   └── src/
│   │       └── main/
│   ├── build/
│   ├── gradle/
│   │   └── wrapper/
│   │       └── gradle-wrapper.properties
│   ├── build.gradle
│   ├── gradle.properties
│   ├── gradlew
│   ├── gradlew.bat
│   └── settings.gradle
├── ios/
│   ├── .xcode.env
│   ├── Podfile
│   ├── JogQuest/
│   │   ├── AppDelegate.swift
│   │   ├── Images.xcassets/
│   │   │   └── AppIcon.appiconset/
│   │   ├── Info.plist
│   │   ├── LaunchScreen.storyboard
│   │   └── PrivacyInfo.xcprivacy
│   └── JogQuest.xcodeproj/
│       ├── project.pbxproj
│       └── xcshareddata/
│           └── xcschemes/
├── src/
│   ├── auth/
│   │   └── AuthContext.tsx
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── types.ts
│   ├── screens/
│   │   ├── Activity/
│   │   │   ├── ActivityResultScreen.tsx
│   │   │   └── ActivityScreen.tsx
│   │   ├── Auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SignupScreen.tsx
│   │   ├── Clubs/
│   │   │   ├── ClubDetailsScreen.tsx
│   │   │   ├── ClubsScreen.tsx
│   │   │   └── CreateClubScreen.tsx
│   │   ├── Competitions/
│   │   │   ├── CompetitionDetailsScreen.tsx
│   │   │   ├── CompetitionsScreen.tsx
│   │   │   └── CreateCompetitionScreen.tsx
│   │   ├── History/
│   │   │   └── ActivityHistoryScreen.tsx
│   │   ├── Integrations/
│   │   │   └── IntegrationsScreen.tsx
│   │   ├── Leaderboard/
│   │   │   └── LeaderboardScreen.tsx
│   │   ├── Map/
│   │   │   └── MapScreen.tsx
│   │   ├── Notifications/
│   │   │   └── NotificationsScreen.tsx
│   │   ├── Profile/
│   │   │   └── ProfileScreen.tsx
│   │   ├── RoutePlanner/
│   │   │   └── RoutePlannerScreen.tsx
│   │   ├── Social/
│   │   │   ├── FollowListScreen.tsx
│   │   │   ├── PublicProfileScreen.tsx
│   │   │   └── SocialFeedScreen.tsx
│   │   └── Territory/
│   │       └── TerritoryDetailsScreen.tsx
│   └── utils/
│       ├── geo.ts
│       ├── territory.ts
│       └── territoryStorage.ts
├── server/
│   ├── .env
│   ├── .gitignore
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── db.ts
│       ├── index.ts
│       └── db/
│           └── schema.sql
└── node_modules/
```

---

## 3) Directory purpose summary

### App shell and navigation

- `App.tsx` — app entry point
- `src/navigation/AppNavigator.tsx` — registered screens and navigator setup
- `src/navigation/types.ts` — screen params and navigation typing
- `src/auth/AuthContext.tsx` — auth/session state

### Feature screens

- `src/screens/Activity/` — activity capture and result review
- `src/screens/Auth/` — login and signup
- `src/screens/Clubs/` — club discovery, creation, and detail flows
- `src/screens/Competitions/` — competition browsing and creation
- `src/screens/History/` — historical activity review
- `src/screens/Integrations/` — external service connections
- `src/screens/Leaderboard/` — user ranking views
- `src/screens/Map/` — territory and map exploration
- `src/screens/Notifications/` — user notifications
- `src/screens/Profile/` — current user profile and account controls
- `src/screens/RoutePlanner/` — route planning screen
- `src/screens/Social/` — feed, public profiles, follows
- `src/screens/Territory/` — territory detail screens

### Shared utilities

- `src/utils/geo.ts` — geographic calculations
- `src/utils/territory.ts` — route validation and territory rules
- `src/utils/territoryStorage.ts` — local territory persistence

### Backend

- `server/src/index.ts` — Express API bootstrap and route handlers
- `server/src/db.ts` — database connection helper
- `server/src/db/schema.sql` — Postgres/PostGIS schema definitions

### Native platform projects

- `android/` — Android project and Gradle config
- `ios/` — iOS project and Xcode config

---

## 4) Feature-to-screen mapping

```text
Auth
  -> LoginScreen.tsx
  -> SignupScreen.tsx

Activity
  -> ActivityScreen.tsx
  -> ActivityResultScreen.tsx
  -> ActivityHistoryScreen.tsx

Territory
  -> TerritoryDetailsScreen.tsx

Social
  -> SocialFeedScreen.tsx
  -> PublicProfileScreen.tsx
  -> FollowListScreen.tsx

Clubs
  -> ClubsScreen.tsx
  -> ClubDetailsScreen.tsx
  -> CreateClubScreen.tsx

Competitions
  -> CompetitionsScreen.tsx
  -> CompetitionDetailsScreen.tsx
  -> CreateCompetitionScreen.tsx

Utility
  -> NotificationsScreen.tsx
  -> RoutePlannerScreen.tsx
  -> IntegrationsScreen.tsx

Leaderboard
  -> LeaderboardScreen.tsx

Profile
  -> ProfileScreen.tsx

Map
  -> MapScreen.tsx
```

---

## 5) Notes

- The project is a React Native mobile app with a separate Express/PostgreSQL backend.
- The app source is organized by feature area under `src/screens/`.
- Native Android and iOS projects live outside the app source tree, alongside the JS app root.
- Build artifacts and dependency folders such as `node_modules/` and Android/iOS generated files are kept out of the design structure, even though they exist in the workspace.
