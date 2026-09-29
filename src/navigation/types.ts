export type Coordinate = {
  latitude: number;
  longitude: number;
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
    territory: StoredTerritory;
  };
};