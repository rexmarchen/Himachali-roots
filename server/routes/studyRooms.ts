import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { SessionUser } from '../../shared/types.js';
import {
  createStudyRoom,
  getRoomDetail,
  joinStudyRoom,
  leaveStudyRoom,
  listStudyRooms,
  postRoomEvent,
  registerDiscoveryClient,
  registerRoomClient,
  seedStudyRoomsIfEmpty,
  sweepStaleMembers,
  updateCollaborativeState,
  updateHeartbeat,
} from '../lib/studyRoomsManager.js';

interface RequestWithUser extends Request {
  user?: SessionUser;
}

function getRoomId(req: Request): string {
  const param = req.params.roomId;
  return Array.isArray(param) ? param[0] : (param || '');
}

function resolveUser(req: RequestWithUser, body: any = {}): { id: string; name: string; avatar?: string } {
  if (req.user) {
    return {
      id: req.user.id,
      name: req.user.fullName || req.user.email.split('@')[0],
      avatar: undefined,
    };
  }

  const rawId = body?.userId || req.headers['x-student-id'];
  const rawName = body?.userName || req.headers['x-student-name'];
  const rawAvatar = body?.userAvatar;

  const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : 'guest_' + Math.random().toString(36).substring(2, 10);
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Study Partner';

  return { id, name, avatar: typeof rawAvatar === 'string' ? rawAvatar : undefined };
}

export function studyRoomsRouter(db: Db): Router {
  const router = Router();

  // Ensure initial seed rooms are available
  try {
    seedStudyRoomsIfEmpty(db);
  } catch (err) {
    console.error('Failed to seed study rooms:', err);
  }

  // Periodic stale sweep every 15 seconds
  const sweepInterval = setInterval(() => {
    try {
      sweepStaleMembers(db);
    } catch (err) {
      console.error('Study rooms stale sweep error:', err);
    }
  }, 15_000);
  sweepInterval.unref();

  // --------------------------------------------------------------------------
  // REAL-TIME SSE STREAMS (ZERO-POLLING)
  // --------------------------------------------------------------------------

  /**
   * Global SSE stream for active rooms list updates
   */
  router.get('/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Initial greeting
    res.write(`:connected\n\n`);

    const unregister = registerDiscoveryClient(res);

    // Keepalive ping every 15 seconds
    const ping = setInterval(() => {
      try {
        res.write(`:keepalive\n\n`);
      } catch {
        clearInterval(ping);
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(ping);
      unregister();
    });
  });

  /**
   * In-Room SSE stream for specific room events
   */
  router.get('/rooms/:roomId/stream', (req: Request, res: Response) => {
    const roomId = getRoomId(req);
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(`:connected to room ${roomId}\n\n`);

    const unregister = registerRoomClient(roomId, res, userId);

    const ping = setInterval(() => {
      try {
        res.write(`:keepalive\n\n`);
      } catch {
        clearInterval(ping);
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(ping);
      unregister();
    });
  });

  // --------------------------------------------------------------------------
  // ROOM CRUD & LIFECYCLE REST ENDPOINTS
  // --------------------------------------------------------------------------

  /**
   * List study rooms with filters
   */
  router.get('/rooms', (req: Request, res: Response) => {
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const availability =
      req.query.availability === 'available' || req.query.availability === 'full'
        ? req.query.availability
        : 'all';

    const rooms = listStudyRooms(db, { subject, search, availability });
    res.json({ rooms });
  });

  /**
   * Get single room details
   */
  router.get('/rooms/:roomId', (req: Request, res: Response) => {
    const detail = getRoomDetail(db, getRoomId(req));
    if (!detail) {
      res.status(404).json({ error: { code: 'room_not_found', message: 'Study room not found or has been closed.' } });
      return;
    }
    res.json(detail);
  });

  /**
   * Create a new study room
   */
  const createSchema = z.object({
    name: z.string().trim().min(3, 'Room name must be at least 3 characters').max(80),
    subject: z.string().trim().min(2, 'Subject is required').max(50),
    description: z.string().trim().max(300).optional(),
    maxParticipants: z.number().int().min(2, 'Must have at least 2 participants').max(25, 'Maximum limit is 25'),
    visibility: z.enum(['public', 'unlisted']).default('public'),
    studyMode: z.enum(['pomodoro', 'focus', 'discussion', 'cram']).default('pomodoro'),
    durationMinutes: z.number().int().min(5, 'Duration must be at least 5 minutes').max(720, 'Duration cannot exceed 12 hours').default(60),
    userId: z.string().optional(),
    userName: z.string().optional(),
    userAvatar: z.string().optional(),
  });

  router.post('/rooms', (req: RequestWithUser, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'invalid_input',
          message: parsed.error.issues[0]?.message || 'Invalid room creation data',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      });
      return;
    }

    const user = resolveUser(req, req.body);
    try {
      const detail = createStudyRoom(db, {
        name: parsed.data.name,
        subject: parsed.data.subject,
        description: parsed.data.description,
        hostId: user.id,
        hostName: user.name,
        maxParticipants: parsed.data.maxParticipants,
        visibility: parsed.data.visibility,
        studyMode: parsed.data.studyMode,
        durationMinutes: parsed.data.durationMinutes,
      });

      res.status(201).json(detail);
    } catch (err) {
      console.error('Room creation error:', err);
      res.status(500).json({ error: { code: 'creation_failed', message: 'Could not create study room.' } });
    }
  });

  /**
   * Join a study room with atomic capacity check
   */
  router.post('/rooms/:roomId/join', (req: RequestWithUser, res: Response) => {
    const user = resolveUser(req, req.body);
    const roomId = getRoomId(req);
    try {
      const detail = joinStudyRoom(db, roomId, user);
      res.json(detail);
    } catch (err: any) {
      if (err.message === 'ROOM_FULL') {
        res.status(409).json({
          error: {
            code: 'room_full',
            message: 'This study room has reached its maximum capacity. Please join another room or create a new one.',
          },
        });
        return;
      }
      if (err.message === 'ROOM_EXPIRED') {
        res.status(410).json({
          error: {
            code: 'room_expired',
            message: 'This study room has reached its scheduled expiry countdown and has closed automatically.',
          },
        });
        return;
      }
      if (err.message === 'ROOM_CLOSED') {
        res.status(410).json({
          error: {
            code: 'room_closed',
            message: 'This study room is no longer active.',
          },
        });
        return;
      }
      if (err.message === 'ROOM_NOT_FOUND') {
        res.status(404).json({
          error: {
            code: 'room_not_found',
            message: 'Study room not found.',
          },
        });
        return;
      }
      console.error('Join room error:', err);
      res.status(500).json({ error: { code: 'join_failed', message: 'Failed to join room.' } });
    }
  });

  /**
   * Leave a study room
   */
  router.post('/rooms/:roomId/leave', (req: RequestWithUser, res: Response) => {
    const user = resolveUser(req, req.body);
    const roomId = getRoomId(req);
    try {
      const result = leaveStudyRoom(db, roomId, user.id, req.body?.reason);
      res.json(result);
    } catch (err) {
      console.error('Leave room error:', err);
      res.status(500).json({ error: { code: 'leave_failed', message: 'Failed to leave room.' } });
    }
  });

  /**
   * Heartbeat to maintain live presence
   */
  router.post('/rooms/:roomId/heartbeat', (req: RequestWithUser, res: Response) => {
    const user = resolveUser(req, req.body);
    const status = req.body?.status;
    const ok = updateHeartbeat(db, getRoomId(req), user.id, status);
    res.json({ ok });
  });

  /**
   * Update collaborative state (Pomodoro, shared notes, study goals)
   */
  router.post('/rooms/:roomId/collab', (req: RequestWithUser, res: Response) => {
    const user = resolveUser(req, req.body);
    const roomId = getRoomId(req);
    try {
      const collab = updateCollaborativeState(db, roomId, user.id, user.name, {
        pomodoroState: req.body?.pomodoroState,
        sharedNotes: req.body?.sharedNotes,
        studyGoals: req.body?.studyGoals,
      });
      res.json({ collab });
    } catch (err: any) {
      res.status(400).json({ error: { code: 'collab_failed', message: err.message || 'Failed to update collaborative state.' } });
    }
  });

  /**
   * Post study chat or status event
   */
  router.post('/rooms/:roomId/event', (req: RequestWithUser, res: Response) => {
    const user = resolveUser(req, req.body);
    const eventType = req.body?.eventType || 'message';
    const content = String(req.body?.content || '').trim();

    if (!content) {
      res.status(400).json({ error: { code: 'empty_content', message: 'Message content cannot be empty.' } });
      return;
    }

    try {
      const event = postRoomEvent(db, getRoomId(req), user, eventType, content);
      res.json({ event });
    } catch {
      res.status(500).json({ error: { code: 'post_failed', message: 'Failed to post event.' } });
    }
  });

  return router;
}
