import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
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

// Render runs behind a trusted reverse proxy.
app.set('trust proxy', 1);

// Browser origins must be explicitly allowed.
// Native mobile clients generally send no Origin header.
const configuredOrigins = process.env.CORS_ORIGINS ??
  (process.env.NODE_ENV === 'production'
    ? ''
    : 'http://localhost:3000,http://localhost:8081,http://localhost:19006');

const allowedOrigins = new Set(
  configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

// Reject unapproved browser origins while allowing native clients
// and command-line clients that do not send an Origin header.
app.use((req, res, next) => {
  const origin = req.get('Origin');

  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  next();
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// General API abuse protection.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Stricter limits for authentication and account-recovery endpoints.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recovery attempts. Please try again later.' },
});

// Apply the general limiter and then stricter limits to sensitive endpoints.
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/auth/forgot-password', recoveryLimiter);
app.use('/api/auth/reset-password', recoveryLimiter);

// Reject oversized JSON and form submissions.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

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