import type { Express } from 'express';

import { registerAuthRoutes } from './auth.js';
import { registerProfileRoutes } from './profile.js';
import { registerUsersRoutes } from './users.js';
import { registerActivitiesRoutes } from './activities.js';
import { registerTerritoriesRoutes } from './territories.js';
import { registerPostsRoutes } from './posts.js';
import { registerSocialRoutes } from './social.js';
import { registerClubsRoutes } from './clubs.js';
import { registerLeaderboardRoutes } from './leaderboard.js';
import { registerRoutesRoutes } from './routes.js';
import { registerDevicesRoutes } from './devices.js';
import { registerMessagingRoutes } from './messaging.js';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  registerAuthRoutes(app, context);
  registerProfileRoutes(app, context);
  registerUsersRoutes(app, context);
  registerActivitiesRoutes(app, context);
  registerTerritoriesRoutes(app, context);
  registerPostsRoutes(app, context);
  registerSocialRoutes(app, context);
  registerClubsRoutes(app, context);
  registerLeaderboardRoutes(app, context);
  registerRoutesRoutes(app, context);
  registerDevicesRoutes(app, context);
  registerMessagingRoutes(app, context);
}
