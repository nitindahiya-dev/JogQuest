export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type ActivityResultParams = {
  activityType: 'Run' | 'Walk' | 'Cycle';
  distance: number;
  elapsedSeconds: number;
  pace: string;
  route: Coordinate[];
};

export type RootStackParamList = {
  MainTabs: undefined;
  ActivityResult: ActivityResultParams;
  TerritoryDetails: undefined;
};