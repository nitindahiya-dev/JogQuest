export type Coordinate = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type StoredTerritory = {
  id: string;
  areaM2: number;
  areaKm2: number;
  polygon: Coordinate[];
  activityType: 'Run' | 'Walk' | 'Cycle';
  capturedAt: string;
};

export type ActivityResultParams = {
  activityType: 'Run' | 'Walk' | 'Cycle';
  distance: number;
  elapsedSeconds: number;
  pace: string;
  route: Coordinate[];
  territory: {
    captured: boolean;
    areaM2: number;
    areaKm2: number;
    polygon: Coordinate[];
  };
};

export type RootStackParamList = {
  MainTabs: undefined;

  ActivityResult: ActivityResultParams;

  TerritoryDetails: {
    territoryId: string;
  };

  ActivityHistory: undefined;

  Notifications: undefined;

  PublicProfile: {
    userId: string;
  };

  FollowList: {
    userId: string;
    mode: 'followers' | 'following';
  };

  Clubs: undefined;

  CreateClub: undefined;

  ClubDetails: {
    clubId: string;
  };

  Competitions: undefined;

  CreateCompetition: undefined;

  CompetitionDetails: {
    competitionId: string;
  };

  RoutePlanner: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Feed: undefined;
  Activity: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};