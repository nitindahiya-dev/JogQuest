import assert from 'node:assert/strict';
import { validateActivityGps } from '../src/gpsValidation.js';

function routeForDistance(km: number) {
  const segments = Math.max(1, Math.ceil(km / 0.1));
  return Array.from({ length: segments + 1 }, (_, i) => ({
    latitude: (km * i / segments) / 111.195,
    longitude: 0,
  }));
}

function activity(
  type: 'Run' | 'Walk' | 'Cycle',
  km: number,
  seconds: number,
) {
  return {
    activityType: type,
    distanceKm: km,
    elapsedSeconds: seconds,
    route: routeForDistance(km),
  };
}

const cases = [
  {
    name: 'normal run accepted',
    input: activity('Run', 5, 1800),
    expected: true,
  },
  {
    name: 'excessive running speed rejected',
    input: activity('Run', 1.2, 24),
    expected: false,
  },
  {
    name: 'normal walk accepted',
    input: activity('Walk', 2, 1440),
    expected: true,
  },
  {
    name: 'excessive walking speed rejected',
    input: activity('Walk', 1, 180),
    expected: false,
  },
  {
    name: 'normal cycling speed accepted',
    input: activity('Cycle', 10, 1440),
    expected: true,
  },
  {
    name: 'excessive cycling speed rejected',
    input: activity('Cycle', 1, 36),
    expected: false,
  },
  {
    name: 'out-of-range latitude rejected',
    input: {
      ...activity('Run', 0.1, 60),
      route: [
        { latitude: 91, longitude: 0 },
        { latitude: 91, longitude: 0.0001 },
      ],
    },
    expected: false,
  },
  {
    name: 'zero elapsed time rejected',
    input: activity('Run', 1, 0),
    expected: false,
  },
  {
    name: 'GPS jump over 500 metres rejected',
    input: {
      ...activity('Run', 0.1, 3600),
      route: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.01 },
      ],
    },
    expected: false,
  },
  {
    name: 'reported distance mismatch rejected',
    input: {
      ...activity('Run', 1, 3600),
      distanceKm: 2,
    },
    expected: false,
  },
  {
    name: 'one-point route rejected',
    input: {
      ...activity('Run', 0, 60),
      route: [{ latitude: 0, longitude: 0 }],
    },
    expected: false,
  },

  {
    name: 'route without timestamps remains supported',
    input: activity('Run', 1, 600),
    expected: true,
  },
  {
    name: 'non-increasing timestamps rejected',
    input: {
      ...activity('Run', 0.1, 60),
      route: [
        { latitude: 0, longitude: 0, timestamp: 1000 },
        { latitude: 0.0009, longitude: 0, timestamp: 1000 },
      ],
    },
    expected: false,
  },
  {
    name: 'partially missing timestamps rejected',
    input: {
      ...activity('Run', 0.1, 60),
      route: [
        { latitude: 0, longitude: 0, timestamp: 1000 },
        { latitude: 0.0009, longitude: 0 },
      ],
    },
    expected: false,
  },
  {
    name: 'impossible timestamped segment speed rejected',
    input: {
      ...activity('Run', 0.1, 60),
      route: [
        { latitude: 0, longitude: 0, timestamp: 1000 },
        { latitude: 0.0009, longitude: 0, timestamp: 1100 },
      ],
    },
    expected: false,
  },

];

let failed = 0;

for (const test of cases) {
  const result = validateActivityGps(test.input);
  const passed = result.ok === test.expected;

  console.log(
    `${passed ? 'PASS' : 'FAIL'} | ${test.name}` +
    (!passed && !result.ok ? ` | ${result.body.error}` : ''),
  );

  if (!passed) failed += 1;
}

console.log(`\n${cases.length - failed}/${cases.length} tests passed`);
if (failed) process.exitCode = 1;


