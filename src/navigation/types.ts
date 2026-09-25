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
  TerritoryDetails: undefined;
};