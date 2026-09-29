# JogQuest

JogQuest is a GPS-based fitness and territory-capture app built with React Native. The app lets users start a run, walk, or cycle session, track their route in real time, and turn a completed loop into a captured territory when it meets the app's validity rules. Captured territories are displayed on a map and stored locally for later review.

## Overview

JogQuest combines outdoor activity tracking with a lightweight gamified quest system:

- Start an activity session and choose Run, Walk, or Cycle
- Track live GPS location, distance, time, and pace
- Draw the route as the user moves
- Complete a loop that closes near its starting point
- Capture a territory when the route meets the required conditions
- Review captured territories on the map
- Compete through the leaderboard and profile screens

## Features

- Real-time location tracking using `react-native-maps`
- Activity modes for running, walking, and cycling
- Live stats for distance, elapsed time, pace, and GPS samples
- Route validation logic for completed territory loops
- Territory persistence with AsyncStorage
- Map view for all saved territories
- Dark-themed fitness game interface
- Leaderboard and profile sections for progression tracking

## Tech Stack

- React Native
- TypeScript
- React Navigation
- `react-native-maps`
- `@turf/turf`
- `@react-native-async-storage/async-storage`
- Jest

## Project Structure

```text
JogQuest/
├── App.tsx
├── src/
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── types.ts
│   ├── screens/
│   │   ├── Activity/
│   │   │   ├── ActivityScreen.tsx
│   │   │   └── ActivityResultScreen.tsx
│   │   ├── Leaderboard/
│   │   │   └── LeaderboardScreen.tsx
│   │   ├── Map/
│   │   │   └── MapScreen.tsx
│   │   ├── Profile/
│   │   │   └── ProfileScreen.tsx
│   │   └── Territory/
│   │       └── TerritoryDetailsScreen.tsx
│   └── utils/
│       ├── geo.ts
│       ├── territory.ts
│       └── territoryStorage.ts
├── android/
├── ios/
├── package.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Territory Logic

A route becomes a captured territory only when it meets the app's checks:

- enough GPS points are collected
- the route closes near its start point
- the resulting area is large enough to qualify as territory

This logic is handled in the territory utility layer before a territory is stored.

## Getting Started

### Prerequisites

Make sure your React Native development environment is correctly set up for Android and/or iOS.

### Install dependencies

```bash
npm install
```

### Start Metro

```bash
npm start
```

### Run the app

Android:

```bash
npm run android
```

iOS:

```bash
npm run ios
```

## Usage Flow

1. Open the app and navigate to the Activity tab.
2. Choose the activity type: Run, Walk, or Cycle.
3. Press Start Activity and begin moving.
4. The app records GPS data, time, and distance in real time.
5. Finish the session to evaluate whether the route qualifies as a territory.
6. If successful, the captured area is saved and appears on the map.
7. Tap saved territory polygons to review details.

## Notes

- Location permission is required during activity tracking.
- The app is designed for outdoor use with a clear GPS signal.
- Territory capture is based on route completion and area validation, not just distance alone.
- The project currently stores captured territories locally on the device.

## Scripts

```bash
npm start
npm run android
npm run ios
npm test
npm run lint
```

## License

This project is currently intended for local development and learning purposes.
