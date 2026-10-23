import type { RequestHandler } from 'express';
import { query } from '../db.js';
import { hashSessionToken } from '../utils/crypto.js';

export const requireAuth: RequestHandler =
  async (req, res, next) => {
    try {
      const authorization =
        req.headers.authorization;

      if (!authorization?.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      const token = authorization.slice(7).trim();

      if (!token) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      const result = await query<{ user_id: string }>(
        `
        SELECT user_id
        FROM user_sessions
        WHERE token_hash = $1
          AND expires_at > NOW()
        `,
        [hashSessionToken(token)],
      );

      if (result.rows.length === 0) {
        res.status(401).json({
          error: 'Invalid or expired session',
        });
        return;
      }

      res.locals.authenticatedUserId =
        result.rows[0].user_id;

      next();
    } catch (error) {
      console.error('Authentication failed:', error);

      res.status(500).json({
        error: 'Authentication verification failed',
      });
    }
  };
