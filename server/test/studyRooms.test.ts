import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestApp, resetDb } from './helpers.js';
import { sweepStaleMembers } from '../lib/studyRoomsManager.js';
import { execute, queryOne } from '../db.js';

describe('Study Group Room Finder API & Lifecycle', () => {
  const { app, db } = setupTestApp();

  beforeEach(() => {
    resetDb(db);
  });

  it('creates a study room and automatically adds creator as host and first participant', async () => {
    const res = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Calculus III Marathon',
        subject: 'Mathematics',
        description: 'Solving multi-variable integration problems.',
        maxParticipants: 4,
        studyMode: 'pomodoro',
        visibility: 'public',
        userId: 'student_aarav',
        userName: 'Aarav Sharma',
      });

    expect(res.status).toBe(201);
    expect(res.body.room).toBeDefined();
    expect(res.body.room.name).toBe('Calculus III Marathon');
    expect(res.body.room.subject).toBe('Mathematics');
    expect(res.body.room.maxParticipants).toBe(4);
    expect(res.body.room.currentParticipants).toBe(1);
    expect(res.body.room.status).toBe('active');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].userId).toBe('student_aarav');
    expect(res.body.members[0].isHost).toBe(true);
  });

  it('enforces maximum participant capacity atomically and rejects extra joins', async () => {
    // 1. Create a room with max capacity of 2
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Quantum Physics Cram',
        subject: 'Physics',
        maxParticipants: 2,
        userId: 'student_host',
        userName: 'Host Student',
      });

    const roomId = createRes.body.room.id;

    // 2. Second user joins (reaches 2/2 capacity)
    const joinRes1 = await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'student_second',
        userName: 'Second Student',
      });

    expect(joinRes1.status).toBe(200);
    expect(joinRes1.body.room.currentParticipants).toBe(2);
    expect(joinRes1.body.members).toHaveLength(2);

    // 3. Third user attempts to join -> MUST BE ATOMICALLY REJECTED with 409 room_full
    const joinRes2 = await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'student_third',
        userName: 'Third Student',
      });

    expect(joinRes2.status).toBe(409);
    expect(joinRes2.body.error.code).toBe('room_full');
    expect(joinRes2.body.error.message).toContain('maximum capacity');

    // Verify database state remains strictly at 2
    const dbRoom = queryOne<{ current_participants: number }>(db, 'SELECT current_participants FROM study_rooms WHERE id = ?', roomId);
    expect(dbRoom?.current_participants).toBe(2);
  });

  it('prevents a user from joining the same room multiple times (duplicate join prevention)', async () => {
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Linear Algebra Sprint',
        subject: 'Mathematics',
        maxParticipants: 5,
        userId: 'student_host',
        userName: 'Host Student',
      });

    const roomId = createRes.body.room.id;

    // User joins once
    await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'student_priya',
        userName: 'Priya Verma',
      });

    // User attempts to join again with same userId
    const dupRes = await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'student_priya',
        userName: 'Priya Verma',
      });

    expect(dupRes.status).toBe(200);
    // Capacity must NOT be incremented twice
    expect(dupRes.body.room.currentParticipants).toBe(2);
    expect(dupRes.body.members.filter((m: any) => m.userId === 'student_priya')).toHaveLength(1);
  });

  it('automatically closes a study room when the last participant leaves', async () => {
    // 1. Create room with 1 participant
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Macroeconomics Discussion',
        subject: 'Economics',
        maxParticipants: 4,
        userId: 'solo_student',
        userName: 'Solo Learner',
      });

    const roomId = createRes.body.room.id;
    expect(createRes.body.room.status).toBe('active');

    // 2. Solo student leaves
    const leaveRes = await request(app)
      .post(`/api/study/rooms/${roomId}/leave`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'solo_student',
        userName: 'Solo Learner',
      });

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.closed).toBe(true);
    expect(leaveRes.body.remaining).toBe(0);

    // 3. Verify room is marked closed in database
    const dbRoom = queryOne<{ status: string; closed_reason: string; closed_at: string }>(
      db,
      'SELECT status, closed_reason, closed_at FROM study_rooms WHERE id = ?',
      roomId,
    );
    expect(dbRoom?.status).toBe('closed');
    expect(dbRoom?.closed_reason).toBe('All participants have left');
    expect(dbRoom?.closed_at).toBeDefined();

    // 4. Closed room is no longer joinable
    const rejoinRes = await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'new_student',
        userName: 'New Learner',
      });

    expect(rejoinRes.status).toBe(410);
    expect(rejoinRes.body.error.code).toBe('room_closed');
  });

  it('reassigns host role when host leaves while other members remain', async () => {
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Biochemistry Review',
        subject: 'Biology',
        maxParticipants: 5,
        userId: 'host_one',
        userName: 'Host One',
      });

    const roomId = createRes.body.room.id;

    // Second user joins
    await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'member_two',
        userName: 'Member Two',
      });

    // Original host leaves
    const leaveRes = await request(app)
      .post(`/api/study/rooms/${roomId}/leave`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'host_one',
      });

    expect(leaveRes.status).toBe(200);
    expect(leaveRes.body.closed).toBe(false);
    expect(leaveRes.body.remaining).toBe(1);

    // Member two should now be promoted to host
    const roomDetail = await request(app).get(`/api/study/rooms/${roomId}`);
    expect(roomDetail.body.room.hostId).toBe('member_two');
    expect(roomDetail.body.members[0].isHost).toBe(true);
  });

  it('sweeps stale disconnected participants and closes room if abandoned', async () => {
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Disconnect Test Room',
        subject: 'Computer Science',
        maxParticipants: 3,
        userId: 'stale_user',
        userName: 'Stale User',
      });

    const roomId = createRes.body.room.id;

    // Simulate stale heartbeat by updating timestamp to 50 seconds in the past
    const oldTime = new Date(Date.now() - 50_000).toISOString();
    execute(db, 'UPDATE study_room_members SET last_heartbeat = ? WHERE room_id = ?', oldTime, roomId);

    // Run sweep
    const cleaned = sweepStaleMembers(db);
    expect(cleaned).toBeGreaterThanOrEqual(1);

    // Room should now be closed because its only participant disconnected
    const room = queryOne<{ status: string }>(db, 'SELECT status FROM study_rooms WHERE id = ?', roomId);
    expect(room?.status).toBe('closed');
  });

  it('updates collaborative state and synchronizes Pomodoro focus timer', async () => {
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Collaborative Tools Test',
        subject: 'Chemistry',
        maxParticipants: 5,
        userId: 'student_tester',
        userName: 'Tester',
      });

    const roomId = createRes.body.room.id;

    // Update collaborative notes and goals
    const collabRes = await request(app)
      .post(`/api/study/rooms/${roomId}/collab`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'student_tester',
        userName: 'Tester',
        sharedNotes: 'Updated reaction notes for test',
        studyGoals: [{ id: 'g1', text: 'Solve problem 1', completed: true, authorName: 'Tester' }],
        pomodoroState: {
          status: 'running',
          mode: 'focus',
          remainingSeconds: 1400,
          durationSeconds: 1500,
          cycle: 1,
          updatedAt: new Date().toISOString(),
        },
      });

    expect(collabRes.status).toBe(200);
    expect(collabRes.body.collab.sharedNotes).toBe('Updated reaction notes for test');
    expect(collabRes.body.collab.studyGoals).toHaveLength(1);
    expect(collabRes.body.collab.pomodoroState.status).toBe('running');
  });

  it('initializes room expiry countdown and automatically closes room when timer expires', async () => {
    // 1. Create a room with 45 minutes duration
    const createRes = await request(app)
      .post('/api/study/rooms')
      .set('x-requested-with', 'pahadi-roots')
      .send({
        name: 'Timed Sprint Group',
        subject: 'Engineering',
        maxParticipants: 4,
        durationMinutes: 45,
        userId: 'student_sprint',
        userName: 'Sprint Host',
      });

    expect(createRes.status).toBe(201);
    const room = createRes.body.room;
    expect(room.durationMinutes).toBe(45);
    expect(room.expiresAt).toBeDefined();

    const roomId = room.id;

    // 2. Simulate countdown expiry by advancing expires_at into the past
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    execute(db, 'UPDATE study_rooms SET expires_at = ? WHERE id = ?', pastTime, roomId);

    // 3. Attempting to get room detail triggers automatic closure
    const detailRes = await request(app)
      .get(`/api/study/rooms/${roomId}`)
      .set('x-requested-with', 'pahadi-roots');

    expect(detailRes.body.room.status).toBe('closed');
    expect(detailRes.body.room.closedReason).toContain('expired');

    // 4. Attempting to join expired room is rejected with 410 room_expired
    const joinRes = await request(app)
      .post(`/api/study/rooms/${roomId}/join`)
      .set('x-requested-with', 'pahadi-roots')
      .send({
        userId: 'late_student',
        userName: 'Late Student',
      });

    expect(joinRes.status).toBe(410);
    expect(joinRes.body.error.code).toBe('room_expired');
  });
});

