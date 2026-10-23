import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, query } from './db.js';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { validateActivityGps } from './gpsValidation.js';
import { hashPassword, verifyPassword, hashSessionToken } from './utils/crypto.js';
import { calculateRouteDistance, distanceBetweenCoordinates } from './utils/geo.js';
import { getMockGarminActivity } from './utils/activity.js';
import { sendTransactionalEmail } from './services/email.js';
import { requireAuth } from './middleware/auth.js';
import { registerRoutes } from './routes/index.js';

export {
  pool, query, randomBytes, randomUUID, createClient, multer,
  validateActivityGps, hashPassword, verifyPassword, hashSessionToken,
  calculateRouteDistance, distanceBetweenCoordinates, getMockGarminActivity,
  sendTransactionalEmail, requireAuth
};
export type { Coordinate } from './utils/geo.js';
export type {
  DeviceProvider, NormalizedExternalActivity, CreateActivityBody
} from './utils/activity.js';

const app = express();

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error('Only JPEG, PNG, and WebP images are allowed'));
      return;
    }

    callback(null, true);
  },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const result = await query<{ now: string }>(
      'SELECT NOW() AS now',
    );

    res.json({
      ok: true,
      service: 'JogQuest API',
      database: 'connected',
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      service: 'JogQuest API',
      database: 'disconnected',
    });
  }
});

export type RouteMode =
  | 'Run'
  | 'Walk'
  | 'Cycle';

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export const fetchRouteWithRetry =
  async (
    url: string,
    attempts = 3,
  ): Promise<Response> => {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= attempts;
      attempt += 1
    ) {
      try {
        const response =
          await fetch(url);

        return response;
      } catch (error) {
        lastError = error;

        console.error(
          `Routing request failed (${attempt}/${attempts}):`,
          error,
        );

        if (
          attempt < attempts
        ) {
          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                attempt * 1500,
              ),
          );
        }
      }
    }

    throw lastError;
  };

registerRoutes(app, {
  avatarUpload,
  calculateRouteDistance,
  cors,
  createClient,
  createHash,
  distanceBetweenCoordinates,
  dns,
  express,
  fetchRouteWithRetry,
  getMockGarminActivity,
  hashPassword,
  hashSessionToken,
  multer,
  pool,
  query,
  randomBytes,
  randomUUID,
  requireAuth,
  scryptSync,
  sendTransactionalEmail,
  timingSafeEqual,
  validateActivityGps,
  verifyPassword
});

const PORT =
  Number(process.env.PORT) || 4000;

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `JogQuest API running on http://localhost:${PORT}`,
    );
  },
);