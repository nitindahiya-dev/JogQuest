import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerPostsRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { query, requireAuth, createClient, multer, randomUUID } = context;

  const postMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter: (_req: any, file: any, callback: any) => {
      const allowed = [
        'image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/quicktime',
      ];
      if (!allowed.includes(file.mimetype)) {
        callback(new Error('Choose a JPEG, PNG, WebP, MP4, or MOV file'));
        return;
      }
      callback(null, true);
    },
  });

  const handlePostMediaUpload = (req: any, res: any, next: any) => {
    postMediaUpload.single('media')(req, res, (error: any) => {
      if (error) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Media file exceeds the 50 MB upload limit'
            : error.message || 'Media upload failed';

        return res.status(400).json({ error: message });
      }

      next();
    });
  };

router.post(
  '/api/posts',
  requireAuth,
  handlePostMediaUpload,
  async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { content, activityId } = req.body;

    const cleanContent =
      typeof content === 'string'
        ? content.trim()
        : '';

    const file = req.file as {
      buffer: Buffer;
      mimetype: string;
    } | undefined;

    if (!cleanContent && !activityId && !file) {
      return res.status(400).json({
        error: 'Write something, attach media, or select an activity',
      });
    }

    if (cleanContent.length > 500) {
      return res.status(400).json({
        error:
          'Post content cannot exceed 500 characters',
      });
    }

    const userResult = await query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    if (activityId) {
      const activityResult = await query(
        `
        SELECT id
        FROM activities
        WHERE id = $1
          AND user_id = $2
        `,
        [activityId, userId],
      );

      if (activityResult.rows.length === 0) {
        return res.status(400).json({
          error:
            'Activity does not belong to this user',
        });
      }
    }

    let mediaUrl: string | null = null;
    let mediaType: 'image' | 'video' | null = null;
    let uploadedMediaPath: string | null = null;
    let storageClient: any = null;

    if (file) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({
          error: 'Post media storage is not configured',
        });
      }

      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
      };

      const extension = extensionByType[file.mimetype];
      if (!extension) {
        return res.status(400).json({ error: 'Unsupported media format' });
      }

      storageClient = createClient(supabaseUrl, supabaseKey);
      const path = `${userId}/${randomUUID()}.${extension}`;
      uploadedMediaPath = path;

      const { error: uploadError } = await storageClient.storage
        .from('post-media')
        .upload(path, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Post media upload failed:', uploadError.message);
        return res.status(502).json({
          error: 'Could not upload media. Check the post-media storage bucket.',
        });
      }

      mediaUrl = storageClient.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    let result;
    try {
      result = await query(
        `
        INSERT INTO posts (
          user_id, activity_id, content, media_url, media_type
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id, user_id, activity_id, content, media_url, media_type, created_at
        `,
        [userId, activityId ?? null, cleanContent, mediaUrl, mediaType],
      );
    } catch (dbError) {
      if (uploadedMediaPath && storageClient) {
        try {
          const { error: cleanupError } = await storageClient.storage
            .from('post-media')
            .remove([uploadedMediaPath]);
          if (cleanupError) {
            console.error('Post media cleanup failed:', cleanupError.message);
          }
        } catch (cleanupError) {
          console.error('Post media cleanup failed:', cleanupError);
        }
      }
      throw dbError;
    }

    if (!result.rows?.[0]) {
      if (uploadedMediaPath && storageClient) {
        try {
          const { error: cleanupError } = await storageClient.storage
            .from('post-media')
            .remove([uploadedMediaPath]);
          if (cleanupError) {
            console.error('Post media cleanup failed:', cleanupError.message);
          }
        } catch (cleanupError) {
          console.error('Post media cleanup failed:', cleanupError);
        }
      }
      return res.status(500).json({ error: 'Post could not be created' });
    }

    return res.status(201).json(result.rows[0]);
  } catch (error) {
      if (uploadedMediaPath && storageClient) {
        try {
          const { error: cleanupError } = await storageClient.storage
            .from('post-media')
            .remove([uploadedMediaPath]);

          if (cleanupError) {
            console.error('Post media cleanup failed:', cleanupError.message);
          }
        } catch (cleanupError) {
          console.error('Post media cleanup failed:', cleanupError);
        }
      }

    console.error(error);

    res.status(500).json({
      error: 'Failed to create post',
    });
  }
});

router.put('/api/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { postId } = req.params;
    const content =
      typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'Post content cannot exceed 500 characters' });
    }

    const result = await query(
      `UPDATE posts
       SET content = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, content, created_at`,
      [content, postId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Post not found or you do not own this post',
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Edit post failed:', error);
    return res.status(500).json({ error: 'Failed to update post' });
  }
});

router.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { postId } = req.params;

    const result = await query(
      `DELETE FROM posts
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [postId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Post not found or you do not own this post',
      });
    }

    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Delete post failed:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

  app.use(router);
}
