import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudyRoomsDiscovery } from '@/lib/studyRealtime';
import { CreateRoomModal } from '@/components/study/CreateRoomModal';
import { StudyNavbar } from '@/components/study/StudyNavbar';

const SUBJECT_CATEGORIES = [
  { name: 'Computer Science', icon: '💻', desc: 'Algorithms, OS, Web, Systems & AI', query: 'Computer Science' },
  { name: 'Mathematics', icon: '📐', desc: 'Calculus, Linear Algebra & Probability', query: 'Mathematics' },
  { name: 'Physics', icon: '⚡', desc: 'Mechanics, Quantum & Electromagnetism', query: 'Physics' },
  { name: 'Chemistry', icon: '🧪', desc: 'Organic, Inorganic & Reaction Review', query: 'Chemistry' },
  { name: 'Biology', icon: '🧬', desc: 'Genetics, Physiology & Biochemistry', query: 'Biology' },
  { name: 'Economics', icon: '📈', desc: 'Micro, Macro, Game Theory & Finance', query: 'Economics' },
  { name: 'Engineering', icon: '⚙️', desc: 'Circuits, Thermodynamics & Statics', query: 'Engineering' },
  { name: 'Literature & Languages', icon: '📚', desc: 'Essay Drafting, Linguistics & Reading', query: 'Literature & Languages' },
];

export function StudyLandingPage() {
  const navigate = useNavigate();
  const { rooms, loading } = useStudyRoomsDiscovery();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const activeRoomsCount = rooms.length;
  const totalParticipants = rooms.reduce((acc, r) => acc + r.currentParticipants, 0);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      <StudyNavbar onOpenCreateModal={() => setCreateModalOpen(true)} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-sand/80 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              {/* Live Status Pill */}
              <div className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/[0.04] px-3.5 py-1 text-xs font-semibold text-forest mb-6">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Collaborative Study Rooms • Real-Time Presence
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl tracking-tight text-forest leading-[1.08]">
                Find your focus with a live study group.
              </h1>

              <p className="mt-5 text-base sm:text-lg text-ink/80 leading-relaxed max-w-2xl">
                Discover active virtual study rooms for any subject or launch your own in seconds.
                Features real-time member roster, atomic capacity limits, synced Pomodoro focus cycles,
                and self-closing rooms.
              </p>

              {/* Direct Call to Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link
                  to="/rooms"
                  id="btn-find-rooms-hero"
                  className="inline-flex items-center gap-2 rounded-sm bg-forest px-6 py-3 text-sm font-semibold text-paper shadow-sm hover:bg-forest-deep transition-all duration-150"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Find a Study Room
                </Link>

                <button
                  type="button"
                  id="btn-create-room-hero"
                  onClick={() => setCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-sm border border-forest/30 bg-surface px-6 py-3 text-sm font-semibold text-forest shadow-xs hover:border-forest hover:bg-forest/5 transition-all duration-150"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create a Room
                </button>
              </div>

              {/* Live Statistics Counter */}
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-sand pt-6">
                <div>
                  <div className="font-serif text-2xl sm:text-3xl font-medium text-forest">
                    {loading ? '…' : activeRoomsCount}
                  </div>
                  <div className="text-xs text-muted font-medium mt-0.5">Active Rooms</div>
                </div>
                <div>
                  <div className="font-serif text-2xl sm:text-3xl font-medium text-forest">
                    {loading ? '…' : totalParticipants}
                  </div>
                  <div className="text-xs text-muted font-medium mt-0.5">Students Studying</div>
                </div>
                <div>
                  <div className="font-serif text-2xl sm:text-3xl font-medium text-forest">
                    100%
                  </div>
                  <div className="text-xs text-muted font-medium mt-0.5">Real-time Zero Polling</div>
                </div>
                <div>
                  <div className="font-serif text-2xl sm:text-3xl font-medium text-forest">
                    Atomic
                  </div>
                  <div className="text-xs text-muted font-medium mt-0.5">Capacity Enforcement</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Active Room Previews */}
        <section className="py-14 border-b border-sand/80">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-terra">Live Right Now</span>
                <h2 className="font-serif text-2xl sm:text-3xl text-forest mt-1">
                  Active Study Rooms
                </h2>
              </div>
              <Link
                to="/rooms"
                className="text-xs font-semibold text-forest hover:text-terra flex items-center gap-1 transition-colors"
              >
                View all rooms &rarr;
              </Link>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 rounded-sm border border-sand bg-surface p-5 animate-pulse" />
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="rounded-sm border border-dashed border-sand bg-surface p-8 text-center">
                <p className="text-sm text-muted mb-3">No active rooms at the moment.</p>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="rounded-sm bg-forest px-4 py-2 text-xs font-semibold text-paper"
                >
                  Create the First Room
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {rooms.slice(0, 6).map((room) => {
                  const isFull = room.currentParticipants >= room.maxParticipants;
                  const ratio = Math.min(100, Math.round((room.currentParticipants / room.maxParticipants) * 100));

                  return (
                    <div
                      key={room.id}
                      className="group flex flex-col justify-between rounded-sm border border-sand bg-surface p-5 shadow-2xs hover:border-forest/40 hover:shadow-sm transition-all"
                    >
                      <div>
                        {/* Header Badges */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="inline-block rounded-xs bg-forest/8 px-2.5 py-0.5 text-[11px] font-semibold text-forest">
                            {room.subject}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isFull
                                ? 'bg-rose-100 text-rose-800'
                                : ratio >= 80
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isFull ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'
                              }`}
                            />
                            {isFull ? 'Full Room' : `${room.currentParticipants}/${room.maxParticipants} Spots`}
                          </span>
                        </div>

                        {/* Room Name */}
                        <h3 className="font-serif text-lg font-medium text-forest group-hover:text-terra transition-colors line-clamp-1">
                          {room.name}
                        </h3>

                        {room.description && (
                          <p className="mt-1.5 text-xs text-muted line-clamp-2 leading-relaxed">
                            {room.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 pt-3.5 border-t border-sand/70">
                        {/* Capacity Progress Bar */}
                        <div className="w-full bg-sand/60 rounded-full h-1.5 overflow-hidden mb-3">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isFull ? 'bg-rose-500' : ratio >= 80 ? 'bg-amber-500' : 'bg-forest'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-muted">
                            Host: <span className="font-semibold text-ink">{room.hostName}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => navigate(`/rooms/${room.id}`)}
                            disabled={isFull}
                            className={`inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isFull
                                ? 'bg-sand/60 text-muted cursor-not-allowed'
                                : 'bg-forest text-paper hover:bg-forest-deep'
                            }`}
                          >
                            {isFull ? 'Room Full' : 'Join Room'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Subject Category Quick Explorer */}
        <section className="py-16 border-b border-sand/80 bg-paper/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-terra">Explore By Discipline</span>
              <h2 className="font-serif text-3xl text-forest mt-1.5">
                Browse Rooms by Subject
              </h2>
              <p className="text-xs text-muted mt-2">
                Join a specialized group dedicated to your course or exam requirements.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SUBJECT_CATEGORIES.map((cat) => (
                <Link
                  key={cat.name}
                  to={`/rooms?subject=${encodeURIComponent(cat.query)}`}
                  className="group flex flex-col justify-between rounded-sm border border-sand bg-surface p-4 hover:border-forest hover:shadow-xs transition-all"
                >
                  <div>
                    <span className="text-2xl mb-2 block">{cat.icon}</span>
                    <h3 className="font-serif text-base font-medium text-forest group-hover:text-terra transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-[11px] text-muted mt-1 leading-snug">{cat.desc}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] font-semibold text-forest">
                    <span>Explore rooms</span>
                    <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Architectural Principles & Hackathon Rules Adherence */}
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-terra">Collaborative Architecture</span>
              <h2 className="font-serif text-3xl text-forest mt-1.5">
                Engineered for Live Accountability
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="rounded-sm border border-sand bg-surface p-5">
                <div className="text-2xl mb-2">⚡</div>
                <h3 className="font-serif text-base font-medium text-forest">Zero-Polling Real-Time</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Powered by native persistent Server-Sent Events (SSE). Member joins, departures, and count changes update immediately across all connected screens.
                </p>
              </div>

              <div className="rounded-sm border border-sand bg-surface p-5">
                <div className="text-2xl mb-2">🔒</div>
                <h3 className="font-serif text-base font-medium text-forest">Atomic Capacity Guard</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Transactions execute using serializable immediate locks. When a room reaches capacity, new join requests are rejected atomically at the server level.
                </p>
              </div>

              <div className="rounded-sm border border-sand bg-surface p-5">
                <div className="text-2xl mb-2">⏱️</div>
                <h3 className="font-serif text-base font-medium text-forest">Synced Pomodoro Focus</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Start a 25-minute focus session or 5-minute break. All room members' countdown rings sync together with zero audio/video dependencies.
                </p>
              </div>

              <div className="rounded-sm border border-sand bg-surface p-5">
                <div className="text-2xl mb-2">🚪</div>
                <h3 className="font-serif text-base font-medium text-forest">Auto-Closing Lifecycle</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Rooms are temporary spaces. When the last participant leaves or disconnects, the room automatically closes and archives itself from active discovery.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-sand bg-forest text-paper py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-paper/70">
          <div>
            <span className="font-serif text-sm font-semibold text-paper">StudyHub</span> • Study Group Room Finder
          </div>
          <div>
            Real-time collaborative study platform with zero WebRTC/video restrictions.
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      <CreateRoomModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </div>
  );
}
