import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import 'dotenv/config';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
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
      databasePool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: pool.options.max,
      },
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

const routeContext: Record<string, any> = {
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
  io: undefined,
  scryptSync,
  sendTransactionalEmail,
  timingSafeEqual,
  validateActivityGps,
  verifyPassword
};

registerRoutes(app, routeContext);

const PORT =
  Number(process.env.PORT) || 4000;

const server = app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `JogQuest API running on http://localhost:${PORT}`,
    );
  },
);


// Socket.IO real-time messaging.
// REST remains responsible for persistence; sockets only deliver committed events.
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token ?? '').trim();
    if (!token) return next(new Error('Authentication required'));

    const session = await query<{ user_id: string }>(
      `SELECT user_id
       FROM user_sessions
       WHERE token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [hashSessionToken(token)],
    );

    if (!session.rows.length) {
      return next(new Error('Invalid or expired session'));
    }

    socket.data.userId = session.rows[0].user_id;
    next();
  } catch (error) {
    console.error('Socket authentication failed:', error);
    next(new Error('Authentication verification failed'));
  }
});

routeContext.io = io;

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;

  // A private per-user room can be used for inbox-level events later.
  socket.join(`user:${userId}`);

  socket.on('conversation:join', async (payload: unknown, acknowledge?: (result: any) => void) => {
    try {
      const conversationId =
        typeof payload === 'string'
          ? payload
          : (payload as any)?.conversationId;

      if (
        typeof conversationId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)
      ) {
        acknowledge?.({ ok: false, error: 'Invalid conversation' });
        return;
      }

      const membership = await query(
        `SELECT 1
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
         WHERE cp.conversation_id = $1
           AND cp.user_id = $2
           AND NOT EXISTS (
             SELECT 1
             FROM user_blocks b
             WHERE (b.blocker_id = c.user_one_id AND b.blocked_id = c.user_two_id)
                OR (b.blocker_id = c.user_two_id AND b.blocked_id = c.user_one_id)
           )
         LIMIT 1`,
        [conversationId, userId],
      );

      if (!membership.rowCount) {
        acknowledge?.({ ok: false, error: 'Conversation unavailable' });
        return;
      }

      await socket.join(`conversation:${conversationId}`);
      acknowledge?.({ ok: true });
    } catch (error) {
      console.error('Socket conversation join failed:', error);
      acknowledge?.({ ok: false, error: 'Could not join conversation' });
    }
  });

  socket.on('conversation:leave', (payload: unknown) => {
    const conversationId =
      typeof payload === 'string'
        ? payload
        : (payload as any)?.conversationId;

    if (typeof conversationId === 'string') {
      void socket.leave(`conversation:${conversationId}`);
    }
  });
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received; shutting down JogQuest API.`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 15000);

  // Keep the shutdown timeout active; clear it when shutdown completes.

  io.close();
  server.close(async (serverError) => {
    clearTimeout(forceExitTimer);
    if (serverError) {
      console.error('HTTP server shutdown failed:', serverError);
      process.exitCode = 1;
    }

    try {
      await pool.end();
      console.log('PostgreSQL pool closed.');
    } catch (error) {
      console.error('Failed to close PostgreSQL pool:', error);
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExitTimer);
      process.exit();
    }
  });
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});