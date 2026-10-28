import type { Response } from 'express';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import type {
  MemberPresenceStatus,
  PomodoroState,
  RoomStreamMessage,
  StudyGoal,
  StudyMode,
  StudyRoom,
  StudyRoomCollab,
  StudyRoomDetailView,
  StudyRoomEvent,
  StudyRoomMember,
} from '../../shared/types.js';

// Global pub/sub for room discovery and specific in-room event streaming
interface ClientSubscription {
  res: Response;
  roomId?: string;
  userId?: string;
}

const discoveryClients = new Set<Response>();
const roomClients = new Map<string, Set<ClientSubscription>>();

/**
 * Register an SSE client for global room discovery updates
 */
export function registerDiscoveryClient(res: Response): () => void {
  discoveryClients.add(res);
  return () => {
    discoveryClients.delete(res);
  };
}

/**
 * Register an SSE client for a specific study room
 */
export function registerRoomClient(roomId: string, res: Response, userId?: string): () => void {
  if (!roomClients.has(roomId)) {
    roomClients.set(roomId, new Set());
  }
  const client: ClientSubscription = { res, roomId, userId };
  roomClients.get(roomId)!.add(client);

  return () => {
    const clients = roomClients.get(roomId);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        roomClients.delete(roomId);
      }
    }
  };
}

/**
 * Broadcast an event to discovery subscribers
 */
export function broadcastDiscovery(msg: RoomStreamMessage): void {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of discoveryClients) {
    try {
      client.write(data);
    } catch {
      discoveryClients.delete(client);
    }
  }
}

/**
 * Broadcast an event to members of a specific room
 */
export function broadcastRoom(roomId: string, msg: RoomStreamMessage): void {
  const clients = roomClients.get(roomId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

// ----------------------------------------------------------------------------
// DATABASE MAPPINGS
// ----------------------------------------------------------------------------

export function initStudyRoomColumns(db: Db): void {
  try {
    db.exec('ALTER TABLE study_rooms ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;');
  } catch {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE study_rooms ADD COLUMN expires_at TEXT;');
  } catch {
    // Column already exists
  }
}

function mapRoomRow(row: any): StudyRoom {
  const duration = Number(row.duration_minutes) || 60;
  const createdAt = row.created_at || new Date().toISOString();
  const expiresAt = row.expires_at || new Date(new Date(createdAt).getTime() + duration * 60_000).toISOString();

  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    description: row.description || null,
    hostId: row.host_id,
    hostName: row.host_name,
    maxParticipants: Number(row.max_participants),
    currentParticipants: Number(row.current_participants),
    visibility: row.visibility,
    status: row.status,
    studyMode: row.study_mode,
    durationMinutes: duration,
    expiresAt,
    createdAt,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
    closedReason: row.closed_reason || null,
  };
}

function mapMemberRow(row: any): StudyRoomMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar || null,
    isHost: Boolean(row.is_host),
    joinedAt: row.joined_at,
    lastHeartbeat: row.last_heartbeat,
    status: row.status as MemberPresenceStatus,
  };
}

function mapCollabRow(row: any): StudyRoomCollab {
  let pomodoroState: PomodoroState = {
    status: 'idle',
    mode: 'focus',
    remainingSeconds: 1500,
    durationSeconds: 1500,
    cycle: 1,
    updatedAt: new Date().toISOString(),
  };
  let studyGoals: StudyGoal[] = [];

  try {
    if (row?.pomodoro_state) {
      pomodoroState = JSON.parse(row.pomodoro_state);
    }
  } catch {
    // fallback default
  }

  try {
    if (row?.study_goals) {
      studyGoals = JSON.parse(row.study_goals);
    }
  } catch {
    // fallback default
  }

  return {
    roomId: row.room_id,
    pomodoroState,
    sharedNotes: row.shared_notes || '',
    studyGoals,
    updatedAt: row.updated_at,
  };
}

// ----------------------------------------------------------------------------
// ROOM OPERATIONS WITH ATOMIC CONCURRENCY SAFETY
// ----------------------------------------------------------------------------

/**
 * Automatically close an expired room when its scheduled countdown reaches 00:00
 */
export function closeRoomExpired(
  db: Db,
  roomId: string,
  reason = 'Room expired automatically after scheduled countdown reached 00:00',
): StudyRoom | null {
  const now = new Date().toISOString();
  return tx(db, () => {
    const room = queryOne<any>(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);
    if (!room || room.status !== 'active') return null;

    execute(
      db,
      `UPDATE study_rooms
       SET status = 'closed', current_participants = 0, closed_at = ?, closed_reason = ?, updated_at = ?
       WHERE id = ?`,
      now,
      reason,
      now,
      roomId,
    );

    // Evict all participants
    execute(db, 'DELETE FROM study_room_members WHERE room_id = ?', roomId);

    execute(
      db,
      `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
       VALUES (?, 'system', 'System', 'system', ?, ?)`,
      roomId,
      `⏰ ${reason}`,
      now,
    );

    const updated = queryOne(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);
    const mapped = updated ? mapRoomRow(updated) : null;

    broadcastRoom(roomId, {
      type: 'room_closed',
      roomId,
      reason,
      room: mapped ?? undefined,
      timestamp: now,
    });

    if (mapped) {
      broadcastDiscovery({
        type: 'room_closed',
        roomId,
        room: mapped,
        timestamp: now,
      });
    }

    return mapped;
  });
}

/**
 * Sweep any active rooms that have exceeded their scheduled expires_at countdown
 */
export function sweepExpiredRooms(db: Db): number {
  const nowIso = new Date().toISOString();
  const expired = queryAll<{ id: string }>(
    db,
    "SELECT id FROM study_rooms WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?",
    nowIso,
  );

  let closedCount = 0;
  for (const item of expired) {
    try {
      const closed = closeRoomExpired(db, item.id);
      if (closed) closedCount++;
    } catch {
      // Continue sweeping
    }
  }
  return closedCount;
}

/**
 * List active public study rooms with optional filters
 */
export function listStudyRooms(
  db: Db,
  options: {
    subject?: string;
    search?: string;
    availability?: 'all' | 'available' | 'full';
    limit?: number;
  } = {},
): StudyRoom[] {
  initStudyRoomColumns(db);
  sweepExpiredRooms(db);

  let query = `
    SELECT * FROM study_rooms
    WHERE status = 'active' AND visibility = 'public'
  `;
  const params: any[] = [];

  if (options.subject && options.subject !== 'all') {
    query += ` AND LOWER(subject) = LOWER(?)`;
    params.push(options.subject);
  }

  if (options.search) {
    query += ` AND (LOWER(name) LIKE LOWER(?) OR LOWER(subject) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))`;
    params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
  }

  if (options.availability === 'available') {
    query += ` AND current_participants < max_participants`;
  } else if (options.availability === 'full') {
    query += ` AND current_participants >= max_participants`;
  }

  query += ` ORDER BY current_participants DESC, created_at DESC LIMIT ?`;
  params.push(options.limit ?? 50);

  const rows = queryAll(db, query, ...params);
  return rows.map(mapRoomRow);
}

/**
 * Get full detail for a room
 */
export function getRoomDetail(db: Db, roomId: string): StudyRoomDetailView | null {
  initStudyRoomColumns(db);
  const roomRow = queryOne(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);
  if (!roomRow) return null;

  let room = mapRoomRow(roomRow);
  if (room.status === 'active' && new Date(room.expiresAt).getTime() <= Date.now()) {
    const expired = closeRoomExpired(db, roomId);
    if (expired) room = expired;
  }

  const memberRows = queryAll(
    db,
    'SELECT * FROM study_room_members WHERE room_id = ? ORDER BY is_host DESC, joined_at ASC',
    roomId,
  );
  const members = memberRows.map(mapMemberRow);

  let collabRow = queryOne(db, 'SELECT * FROM study_room_collab WHERE room_id = ?', roomId);
  if (!collabRow) {
    execute(
      db,
      `INSERT OR IGNORE INTO study_room_collab (room_id, pomodoro_state, shared_notes, study_goals, updated_at)
       VALUES (?, '{"status":"idle","mode":"focus","remainingSeconds":1500,"durationSeconds":1500,"cycle":1,"updatedAt":""}', '', '[]', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      roomId,
    );
    collabRow = queryOne(db, 'SELECT * FROM study_room_collab WHERE room_id = ?', roomId);
  }

  const collab = mapCollabRow(collabRow);

  const eventRows = queryAll(
    db,
    'SELECT * FROM study_room_events WHERE room_id = ? ORDER BY id DESC LIMIT 50',
    roomId,
  );
  const recentEvents: StudyRoomEvent[] = eventRows.reverse().map((e: any) => ({
    id: e.id,
    roomId: e.room_id,
    userId: e.user_id,
    userName: e.user_name,
    eventType: e.event_type,
    content: e.content,
    createdAt: e.created_at,
  }));

  return { room, members, collab, recentEvents };
}

/**
 * Create a new study room and automatically add host as first participant
 */
export function createStudyRoom(
  db: Db,
  params: {
    name: string;
    subject: string;
    description?: string;
    hostId: string;
    hostName: string;
    maxParticipants: number;
    visibility?: 'public' | 'unlisted';
    studyMode?: StudyMode;
    durationMinutes?: number;
  },
): StudyRoomDetailView {
  initStudyRoomColumns(db);
  const roomId = 'room_' + Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();
  const maxCap = Math.max(2, Math.min(params.maxParticipants, 50));
  const visibility = params.visibility ?? 'public';
  const studyMode = params.studyMode ?? 'pomodoro';
  const durationMinutes = Math.min(Math.max(Number(params.durationMinutes) || 60, 5), 720);
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();

  return tx(db, () => {
    execute(
      db,
      `INSERT INTO study_rooms (id, name, subject, description, host_id, host_name, max_participants, current_participants, visibility, status, study_mode, duration_minutes, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'active', ?, ?, ?, ?, ?)`,
      roomId,
      params.name.trim(),
      params.subject.trim(),
      params.description?.trim() || null,
      params.hostId,
      params.hostName.trim(),
      maxCap,
      visibility,
      studyMode,
      durationMinutes,
      expiresAt,
      now,
      now,
    );

    // Host joins automatically
    execute(
      db,
      `INSERT INTO study_room_members (room_id, user_id, user_name, is_host, joined_at, last_heartbeat, status)
       VALUES (?, ?, ?, 1, ?, ?, 'active')`,
      roomId,
      params.hostId,
      params.hostName.trim(),
      now,
      now,
    );

    // Initialize collaborative state
    execute(
      db,
      `INSERT INTO study_room_collab (room_id, pomodoro_state, shared_notes, study_goals, updated_at)
       VALUES (?, '{"status":"idle","mode":"focus","remainingSeconds":1500,"durationSeconds":1500,"cycle":1,"updatedAt":""}', '', '[]', ?)`,
      roomId,
      now,
    );

    // Initial event
    execute(
      db,
      `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
       VALUES (?, ?, ?, 'system', ?, ?)`,
      roomId,
      params.hostId,
      params.hostName.trim(),
      `Room created by ${params.hostName.trim()} with ${durationMinutes}-minute countdown`,
      now,
    );

    const detail = getRoomDetail(db, roomId)!;

    // Broadcast new room to discovery
    broadcastDiscovery({
      type: 'room_update',
      roomId,
      room: detail.room,
      timestamp: now,
    });

    return detail;
  });
}

/**
 * Join an existing study room with ATOMIC capacity enforcement and duplicate prevention
 */
export function joinStudyRoom(
  db: Db,
  roomId: string,
  user: { id: string; name: string; avatar?: string },
): StudyRoomDetailView {
  initStudyRoomColumns(db);
  return tx(db, () => {
    const roomRow = queryOne<any>(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);
    if (!roomRow) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const room = mapRoomRow(roomRow);
    if (room.status !== 'active') {
      if (room.closedReason?.toLowerCase().includes('expired') || new Date(room.expiresAt).getTime() <= Date.now()) {
        throw new Error('ROOM_EXPIRED');
      }
      throw new Error('ROOM_CLOSED');
    }

    // Check expiry countdown
    if (new Date(room.expiresAt).getTime() <= Date.now()) {
      closeRoomExpired(db, roomId);
      throw new Error('ROOM_EXPIRED');
    }

    const existingMember = queryOne<any>(
      db,
      'SELECT * FROM study_room_members WHERE room_id = ? AND user_id = ?',
      roomId,
      user.id,
    );

    const now = new Date().toISOString();

    if (existingMember) {
      // User is already in the room: update heartbeat & active status (reconnect)
      execute(
        db,
        `UPDATE study_room_members SET last_heartbeat = ?, status = 'active' WHERE room_id = ? AND user_id = ?`,
        now,
        roomId,
        user.id,
      );
      return getRoomDetail(db, roomId)!;
    }

    // Atomically check capacity
    const memberCount = (
      queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM study_room_members WHERE room_id = ?',
        roomId,
      )?.count ?? 0
    );

    if (memberCount >= Number(roomRow.max_participants)) {
      throw new Error('ROOM_FULL');
    }

    // Insert new member
    execute(
      db,
      `INSERT INTO study_room_members (room_id, user_id, user_name, user_avatar, is_host, joined_at, last_heartbeat, status)
       VALUES (?, ?, ?, ?, 0, ?, ?, 'active')`,
      roomId,
      user.id,
      user.name.trim(),
      user.avatar || null,
      now,
      now,
    );

    const newCount = memberCount + 1;
    execute(
      db,
      `UPDATE study_rooms SET current_participants = ?, updated_at = ? WHERE id = ?`,
      newCount,
      now,
      roomId,
    );

    // Event
    execute(
      db,
      `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
       VALUES (?, ?, ?, 'join', ?, ?)`,
      roomId,
      user.id,
      user.name.trim(),
      `${user.name.trim()} joined the study room`,
      now,
    );

    const detail = getRoomDetail(db, roomId)!;
    const member = detail.members.find((m) => m.userId === user.id);

    // Broadcast to room
    broadcastRoom(roomId, {
      type: 'member_joined',
      roomId,
      room: detail.room,
      member,
      timestamp: now,
    });

    // Broadcast to discovery
    broadcastDiscovery({
      type: 'room_update',
      roomId,
      room: detail.room,
      timestamp: now,
    });

    return detail;
  });
}

/**
 * Leave a study room. Atomically updates member count and CLOSES room if last participant leaves.
 */
export function leaveStudyRoom(
  db: Db,
  roomId: string,
  userId: string,
  _reason = 'User left room',
): { closed: boolean; remaining: number } {
  return tx(db, () => {
    const member = queryOne<any>(
      db,
      'SELECT * FROM study_room_members WHERE room_id = ? AND user_id = ?',
      roomId,
      userId,
    );

    if (!member) {
      // Already not a member
      const room = queryOne<any>(db, 'SELECT current_participants, status FROM study_rooms WHERE id = ?', roomId);
      return { closed: room?.status !== 'active', remaining: room?.current_participants ?? 0 };
    }

    const wasHost = Boolean(member.is_host);
    const userName = member.user_name;
    const now = new Date().toISOString();

    // Delete membership
    execute(db, 'DELETE FROM study_room_members WHERE room_id = ? AND user_id = ?', roomId, userId);

    // Get remaining count
    const remainingMembers = queryAll(
      db,
      'SELECT * FROM study_room_members WHERE room_id = ? ORDER BY joined_at ASC',
      roomId,
    );
    const remaining = remainingMembers.length;

    if (remaining === 0) {
      // AUTOMATIC CLOSURE WHEN LAST PARTICIPANT LEAVES!
      execute(
        db,
        `UPDATE study_rooms
         SET status = 'closed', current_participants = 0, closed_at = ?, closed_reason = ?, updated_at = ?
         WHERE id = ?`,
        now,
        'All participants have left',
        now,
        roomId,
      );

      execute(
        db,
        `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
         VALUES (?, ?, ?, 'leave', ?, ?)`,
        roomId,
        userId,
        userName,
        `${userName} left the study room. Room automatically closed.`,
        now,
      );

      // Broadcast room closed to room and discovery
      broadcastRoom(roomId, {
        type: 'room_closed',
        roomId,
        reason: 'All participants left the room',
        timestamp: now,
      });

      const closedRoom = queryOne(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);
      if (closedRoom) {
        broadcastDiscovery({
          type: 'room_closed',
          roomId,
          room: mapRoomRow(closedRoom),
          timestamp: now,
        });
      }

      return { closed: true, remaining: 0 };
    }

    // If host left, promote the next oldest member to host
    if (wasHost && remainingMembers.length > 0) {
      const nextHost: any = remainingMembers[0];
      execute(
        db,
        'UPDATE study_room_members SET is_host = 1 WHERE room_id = ? AND user_id = ?',
        roomId,
        nextHost.user_id,
      );
      execute(
        db,
        'UPDATE study_rooms SET host_id = ?, host_name = ? WHERE id = ?',
        nextHost.user_id,
        nextHost.user_name,
        roomId,
      );
    }

    execute(
      db,
      'UPDATE study_rooms SET current_participants = ?, updated_at = ? WHERE id = ?',
      remaining,
      now,
      roomId,
    );

    execute(
      db,
      `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
       VALUES (?, ?, ?, 'leave', ?, ?)`,
      roomId,
      userId,
      userName,
      `${userName} left the study room`,
      now,
    );

    const updatedRoom = queryOne(db, 'SELECT * FROM study_rooms WHERE id = ?', roomId);

    // Broadcast member left
    broadcastRoom(roomId, {
      type: 'member_left',
      roomId,
      userId,
      room: updatedRoom ? mapRoomRow(updatedRoom) : undefined,
      timestamp: now,
    });

    if (updatedRoom) {
      broadcastDiscovery({
        type: 'room_update',
        roomId,
        room: mapRoomRow(updatedRoom),
        timestamp: now,
      });
    }

    return { closed: false, remaining };
  });
}

/**
 * Update member heartbeat and status
 */
export function updateHeartbeat(
  db: Db,
  roomId: string,
  userId: string,
  status?: MemberPresenceStatus,
): boolean {
  const now = new Date().toISOString();
  let sql = 'UPDATE study_room_members SET last_heartbeat = ?';
  const params: any[] = [now];

  if (status) {
    sql += ', status = ?';
    params.push(status);
  }

  sql += ' WHERE room_id = ? AND user_id = ?';
  params.push(roomId, userId);

  const res = execute(db, sql, ...params);

  if (res.changes > 0 && status) {
    const member = queryOne(
      db,
      'SELECT * FROM study_room_members WHERE room_id = ? AND user_id = ?',
      roomId,
      userId,
    );
    if (member) {
      broadcastRoom(roomId, {
        type: 'member_status',
        roomId,
        member: mapMemberRow(member),
        timestamp: now,
      });
    }
  }

  return res.changes > 0;
}

/**
 * Sweep stale presence records (members who haven't sent a heartbeat for > 35 seconds)
 * Ensures stale connections never hold up capacity, and closes rooms when all members disconnect.
 */
export function sweepStaleMembers(db: Db): number {
  initStudyRoomColumns(db);
  sweepExpiredRooms(db);

  // 35 seconds stale cutoff
  const cutoff = new Date(Date.now() - 35_000).toISOString();
  const stale = queryAll<{ room_id: string; user_id: string }>(
    db,
    'SELECT room_id, user_id FROM study_room_members WHERE last_heartbeat < ?',
    cutoff,
  );

  let cleaned = 0;
  for (const item of stale) {
    try {
      leaveStudyRoom(db, item.room_id, item.user_id, 'Presence timeout / disconnected');
      cleaned++;
    } catch {
      // Continue sweeping other rooms
    }
  }

  return cleaned;
}

/**
 * Update shared collaborative tools state (Pomodoro, shared notes, study goals)
 */
export function updateCollaborativeState(
  db: Db,
  roomId: string,
  _userId: string,
  _userName: string,
  updates: {
    pomodoroState?: PomodoroState;
    sharedNotes?: string;
    studyGoals?: StudyGoal[];
  },
): StudyRoomCollab {
  const now = new Date().toISOString();
  const current = getRoomDetail(db, roomId)?.collab;
  if (!current) throw new Error('ROOM_NOT_FOUND');

  const newPomodoro = updates.pomodoroState ?? current.pomodoroState;
  const newNotes = updates.sharedNotes !== undefined ? updates.sharedNotes : current.sharedNotes;
  const newGoals = updates.studyGoals ?? current.studyGoals;

  execute(
    db,
    `UPDATE study_room_collab
     SET pomodoro_state = ?, shared_notes = ?, study_goals = ?, updated_at = ?
     WHERE room_id = ?`,
    JSON.stringify(newPomodoro),
    newNotes,
    JSON.stringify(newGoals),
    now,
    roomId,
  );

  const updatedCollab: StudyRoomCollab = {
    roomId,
    pomodoroState: newPomodoro,
    sharedNotes: newNotes,
    studyGoals: newGoals,
    updatedAt: now,
  };

  // Broadcast to room
  broadcastRoom(roomId, {
    type: 'collab_update',
    roomId,
    collab: updatedCollab,
    timestamp: now,
  });

  return updatedCollab;
}

/**
 * Post an event / discussion message into the room
 */
export function postRoomEvent(
  db: Db,
  roomId: string,
  user: { id: string; name: string },
  eventType: 'message' | 'collab' | 'status',
  content: string,
): StudyRoomEvent {
  const now = new Date().toISOString();
  const res = execute(
    db,
    `INSERT INTO study_room_events (room_id, user_id, user_name, event_type, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    roomId,
    user.id,
    user.name.trim(),
    eventType,
    content.trim(),
    now,
  );

  const event: StudyRoomEvent = {
    id: Number(res.lastInsertRowid),
    roomId,
    userId: user.id,
    userName: user.name.trim(),
    eventType,
    content: content.trim(),
    createdAt: now,
  };

  broadcastRoom(roomId, {
    type: 'new_event',
    roomId,
    event,
    timestamp: now,
  });

  return event;
}

/**
 * Seed realistic initial demo rooms if database has 0 active study rooms
 */
export function seedStudyRoomsIfEmpty(db: Db): void {
  const count = queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM study_rooms WHERE status = 'active'")?.count ?? 0;
  if (count > 0) return;

  const demoRooms = [
    {
      name: 'Calculus III & Linear Algebra Sprint',
      subject: 'Mathematics',
      description: 'Working through multivariate optimization and eigenvector problems. 25-minute Pomodoro focus blocks.',
      hostName: 'Aarav Sharma',
      maxParticipants: 5,
      studyMode: 'pomodoro' as StudyMode,
      goals: [
        { id: 'g1', text: 'Lagrange multipliers practice problems 1-8', completed: true, authorName: 'Aarav Sharma' },
        { id: 'g2', text: 'Gram-Schmidt orthogonalization review', completed: false, authorName: 'Aarav Sharma' },
      ],
      notes: 'Key equation for today:\n∇f(x, y) = λ∇g(x, y)\nCheck eigenvalues where det(A - λI) = 0.',
    },
    {
      name: 'Operating Systems & Distributed Systems',
      subject: 'Computer Science',
      description: 'Kernel concurrency, mutex lock primitives, and Raft consensus algorithms discussion & silent cram.',
      hostName: 'Meera Patel',
      maxParticipants: 6,
      studyMode: 'focus' as StudyMode,
      goals: [
        { id: 'g3', text: 'Implement Peterson algorithm edge case analysis', completed: false, authorName: 'Meera Patel' },
        { id: 'g4', text: 'Read Raft leader election paper sections 5.1 - 5.3', completed: false, authorName: 'Meera Patel' },
      ],
      notes: 'Raft notes:\n- Term numbers act as logical clocks\n- Heartbeat interval: 50ms - 150ms\n- Split votes resolved via randomized election timeouts.',
    },
    {
      name: 'Organic Chemistry II — Reaction Mechanisms',
      subject: 'Chemistry',
      description: 'Aldol condensations, Michael additions, and Robinson annulation practice.',
      hostName: 'Rohan Verma',
      maxParticipants: 4,
      studyMode: 'pomodoro' as StudyMode,
      goals: [
        { id: 'g5', text: 'Draw retro-synthetic pathways for target 4B', completed: true, authorName: 'Rohan Verma' },
        { id: 'g6', text: 'Enolate alkylation mechanism flashcards', completed: false, authorName: 'Rohan Verma' },
      ],
      notes: 'Acid vs Base catalyzed:\nBase: Enolate formation (kinetic vs thermodynamic)\nAcid: Enol formation through tautomerism.',
    },
    {
      name: 'Macroeconomics & Monetary Policy',
      subject: 'Economics',
      description: 'IS-LM model shifts, central bank interest rate mechanics, and inflation targeting review.',
      hostName: 'Ananya Roy',
      maxParticipants: 5,
      studyMode: 'discussion' as StudyMode,
      goals: [
        { id: 'g7', text: 'Taylor Rule calculation drills', completed: false, authorName: 'Ananya Roy' },
      ],
      notes: 'Taylor Rule: i_t = r* + π_t + 0.5(π_t - π*) + 0.5(y_t - y*)',
    },
    {
      name: 'Biochemistry & Molecular Genetics',
      subject: 'Biology',
      description: 'DNA replication fork enzymes, CRISPR-Cas9 mechanism, and PCR design.',
      hostName: 'Kabir Das',
      maxParticipants: 4,
      studyMode: 'cram' as StudyMode,
      goals: [
        { id: 'g8', text: 'Helicase & Topoisomerase enzyme comparison table', completed: false, authorName: 'Kabir Das' },
      ],
      notes: 'Topoisomerase I: single-strand nick, no ATP required.\nTopoisomerase II (Gyrase): double-strand break, ATP dependent.',
    },
  ];

  for (const demo of demoRooms) {
    const hostId = 'user_' + Math.random().toString(36).substring(2, 9);
    const detail = createStudyRoom(db, {
      name: demo.name,
      subject: demo.subject,
      description: demo.description,
      hostId,
      hostName: demo.hostName,
      maxParticipants: demo.maxParticipants,
      visibility: 'public',
      studyMode: demo.studyMode,
    });

    // Populate initial collaborative notes and goals
    execute(
      db,
      'UPDATE study_room_collab SET shared_notes = ?, study_goals = ? WHERE room_id = ?',
      demo.notes,
      JSON.stringify(demo.goals),
      detail.room.id,
    );
  }
}
