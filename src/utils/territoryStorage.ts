import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoredCoordinate = {
  latitude: number;
  longitude: number;
};

export type StoredTerritory = {
  id: string;
  areaM2: number;
  areaKm2: number;
  polygon: StoredCoordinate[];
  activityType: 'Run' | 'Walk' | 'Cycle';
  capturedAt: string;
};

const STORAGE_KEY = '@jogquest/territories';

export const getTerritories = async (): Promise<StoredTerritory[]> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load territories:', error);
    return [];
  }
};

export const saveTerritory = async (
  territory: StoredTerritory,
): Promise<void> => {
  try {
    const existing = await getTerritories();

    const updated = [...existing, territory];

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updated),
    );
  } catch (error) {
    console.error('Failed to save territory:', error);
  }
};