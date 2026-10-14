# JogQuest Product Structure

JogQuest is a mobile activity and territory game. People record an outdoor activity, try to close a valid route loop, capture territory, and build progress through maps, social activity, and competition.

This document describes the product in layers: what users get, how they move through it, which app areas implement it, and how the app and backend store and serve the data.

## Layer 1: Product Definition

### Product purpose

Turn everyday running, walking, and cycling into a location-based game by making routes, captured areas, and community progress visible.

### Primary user value

- Track an outdoor activity and review its route and stats.
- Convert a qualifying loop into a territory claim.
- Explore territories and activity on a map.
- Compare progress and connect with other users.
- Join clubs and competitions for shared goals.

### Core product loop

```text
Choose activity
	-> Record GPS route and activity stats
	-> Finish activity
	-> Validate route and territory eligibility
	-> Save and review result
	-> Explore map, share progress, and compete
	-> Start another activity
```

## Layer 2: User-Facing Product Areas

### 1. Account and identity

- Create an account and sign in.
- Restore an authenticated session and sign out.
- View personal and public profiles.
- Manage follower and following lists.

### 2. Activity tracking

- Select Run, Walk, or Cycle.
- Record location points and live activity measurements.
- Finish an activity and see its result.
- Review previous activities and route details.
- Plan a route before starting an activity.

### 3. Territory game

- Validate a route as a potential closed loop.
- Calculate the territory polygon and area for qualifying routes.
- View territories on the map and inspect territory details.
- Track territory history and territory challenges.

The client-side territory rule currently requires at least 10 route points, an endpoint within 50 metres of the start, and an area of at least 1,000 square metres. See `src/utils/territory.ts` for the implementation.

### 4. Social community

- Browse the social feed and posts.
- View another user's public profile.
- Follow and unfollow users; browse followers and following.
- Receive notifications about relevant activity.

### 5. Group competition

- Browse clubs and view club details.
- Create a club.
- Browse competitions, view details, and create a competition.
- Compare users on the leaderboard.

### 6. Connected services

- Open the integrations area for external fitness services.
- The backend includes normalized external activity handling and provider identifiers. The presence of an integration screen or provider code does not guarantee that every provider connection is fully enabled.

## Layer 3: App Navigation and Screen Map

### Authentication flow

```text
App launch
	-> Restore saved session
		 -> No valid user: Login <-> Signup
		 -> Authenticated user: Main tabs
```

Authentication state is provided by `src/auth/AuthContext.tsx`. Credentials are stored using the device keychain; the authenticated user determines whether the navigator shows auth screens or the main app.

### Primary navigation

The authenticated app's bottom tabs are:

| Tab | Product role | Screen |
| --- | --- | --- |
| Map | Explore saved territory | `src/screens/Map/MapScreen.tsx` |
| Feed | Browse social activity | `src/screens/Social/SocialFeedScreen.tsx` |
| Activity | Start and record an activity | `src/screens/Activity/ActivityScreen.tsx` |
| Ranks | Compare leaderboard progress | `src/screens/Leaderboard/LeaderboardScreen.tsx` |
| Profile | View personal progress and account actions | `src/screens/Profile/ProfileScreen.tsx` |

### Secondary and detail navigation

| Area | Screens |
| --- | --- |
| Activity | Activity result, activity history |
| Territory | Territory details |
| Social | Public profile, followers/following |
| Community | Clubs list, create club, club details |
| Competition | Competitions list, create competition, competition details |
| Utility | Notifications, route planner, integrations |

The registered routes and route parameters are defined in `src/navigation/AppNavigator.tsx` and `src/navigation/types.ts`.

## Layer 4: Application and Domain Structure

### Mobile client

```text
App.tsx
	-> AppNavigator
		 -> AuthProvider / session state
		 -> Root stack: authentication or authenticated app
				-> Main tabs
				-> Secondary and detail screens
```

Screen modules are grouped by product domain under `src/screens/`. Shared navigation contracts live under `src/navigation/`, authentication state under `src/auth/`, and territory/geographic helpers under `src/utils/`.

### Domain responsibilities

| Domain | Client responsibility | Supporting code |
| --- | --- | --- |
| Identity | Login, signup, session restore, logout | `src/auth/`, `src/screens/Auth/` |
| Activity | Capture route, show live stats, show result/history | `src/screens/Activity/`, `src/screens/History/` |
| Geography | Route distance and territory polygon/eligibility | `src/utils/geo.ts`, `src/utils/territory.ts` |
| Territory storage | Persist and retrieve captured territories | `src/utils/territoryStorage.ts` |
| Discovery and social | Map, feed, profiles, follows, notifications | `src/screens/Map/`, `src/screens/Social/`, `src/screens/Notifications/` |
| Competition | Leaderboard, clubs, competitions | `src/screens/Leaderboard/`, `src/screens/Clubs/`, `src/screens/Competitions/` |
| Planning and integrations | Plan routes and access connected-service screens | `src/screens/RoutePlanner/`, `src/screens/Integrations/` |

## Layer 5: Backend and Data Structure

### Backend responsibilities

The `server/` package contains an Express API and PostgreSQL access. Its route handlers cover these product domains:

- Health checks and account/session operations.
- User profiles and activity retrieval/creation.
- Leaderboard and territory discovery, claiming, details, history, and challenges.
- Notifications and read state.
- Social feed, posts, follows, likes, and comments.
- Clubs, membership, competitions, and participation.
- External activity/integration handling.

The API entry point is `server/src/index.ts`; database connection helpers are in `server/src/db.ts`.

### Main persisted entities

The schema in `server/src/db/schema.sql` defines these groups:

| Entity group | Main records |
| --- | --- |
| Identity | Users and device integrations |
| Activity | Activities and ordered GPS activity points |
| Territory | Territories, territory history, territory challenges |
| Social | Follows, posts, post likes, post comments |
| Community | Clubs and club members |
| Competition | Competitions and competition participants |
| Engagement | Notifications |

PostgreSQL uses PostGIS geography types and spatial indexes for activity points and territory polygons.

### Storage boundaries

- The client stores authentication credentials in the device keychain.
- The client has an AsyncStorage-backed territory persistence utility.
- The server schema persists users, activities, routes, territories, social data, competitions, and notifications in PostgreSQL.
- The current code therefore has both local territory storage and a server-backed territory model; do not assume they are already a single synchronized source of truth.

## Layer 6: Runtime and Repository Layout

```text
JogQuest/
├── App.tsx                         # React Native application entry
├── src/
│   ├── auth/                       # Authentication/session context
│   ├── navigation/                 # Root stack, tabs, route types
│   ├── screens/
│   │   ├── Activity/               # Activity capture and results
│   │   ├── Auth/                   # Login and signup
│   │   ├── Clubs/                  # Club discovery, creation, details
│   │   ├── Competitions/            # Competition discovery, creation, details
│   │   ├── History/                # Activity history
│   │   ├── Integrations/           # External service connections
│   │   ├── Leaderboard/            # Rankings
│   │   ├── Map/                    # Territory map
│   │   ├── Notifications/          # User notifications
│   │   ├── Profile/                # Current user's profile
│   │   ├── RoutePlanner/           # Route planning
│   │   ├── Social/                 # Feed, public profiles, follow lists
│   │   └── Territory/              # Territory details
│   └── utils/                      # Geo, territory rules, local storage
├── server/
│   └── src/
│       ├── index.ts                # Express API and route handlers
│       ├── db.ts                   # PostgreSQL connection/query helpers
│       └── db/schema.sql           # PostGIS and product data schema
├── android/                        # Android native app and Gradle project
├── ios/                            # iOS native app and Xcode project
├── __tests__/                      # App-level tests
└── package.json                    # React Native scripts and dependencies
```

## Main End-to-End Journeys

### Capture territory

```text
Sign in -> Activity tab -> Choose activity -> Track route -> Finish
	-> Validate route -> View result -> Territory appears in map/storage
```

### Explore and challenge territory

```text
Map -> Select territory -> Territory details -> Review history/challenges
	-> Start an activity to challenge or compete for territory
```

### Social progression

```text
Feed or leaderboard -> Open public profile -> Follow user
	-> Follow activity and receive relevant notifications
```

### Group participation

```text
Clubs or competitions -> Browse or create -> Open details
	-> Join/participate -> Track progress with the community
```

## Project Boundary Notes

- The mobile app is React Native with TypeScript and React Navigation; Android and iOS native projects are included.
- The backend is a separate TypeScript/Express package using PostgreSQL and PostGIS.
- The app's navigation and database schema show the breadth of the product, but screen registration or schema presence alone is not proof that each workflow is complete or connected end to end.
- API configuration currently appears directly in the auth context. Keep environment-specific API URLs configurable when preparing deployments beyond local development.
