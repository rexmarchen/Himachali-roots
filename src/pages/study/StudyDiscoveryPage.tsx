import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { StudyRoom } from '@shared/types';
import { useStudyRoomsDiscovery } from '@/lib/studyRealtime';
import { useStudentProfile } from '@/lib/studentSession';
import { StudyNavbar } from '@/components/study/StudyNavbar';
import { CreateRoomModal } from '@/components/study/CreateRoomModal';

const FILTER_SUBJECTS = [
  'All',
  'Mathematics',
  'Computer Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Engineering',
  'Literature & Languages',
];

export function StudyDiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useStudentProfile();

  const selectedSubject = searchParams.get('subject') || 'All';
  const selectedAvailability = (searchParams.get('availability') as 'all' | 'available' | 'full') || 'all';
  const currentSearch = searchParams.get('search') || '';

  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'activity' | 'newest' | 'spots'>('activity');

  const { rooms, loading, error, connected, refetch } = useStudyRoomsDiscovery({
    subject: selectedSubject,
    search: currentSearch,
    availability: selectedAvailability,
  });

  const handleSubjectChange = (subject: string) => {
    const next = new URLSearchParams(searchParams);
    if (subject === 'All') next.delete('subject');
    else next.set('subject', subject);
    setSearchParams(next);
  };

  const handleAvailabilityChange = (avail: 'all' | 'available' | 'full') => {
    const next = new URLSearchParams(searchParams);
    if (avail === 'all') next.delete('availability');
    else next.set('availability', avail);
    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchQuery.trim()) next.set('search', searchQuery.trim());
    else next.delete('search');
    setSearchParams(next);
  };

  // Client-side sort
  const sortedRooms = useMemo(() => {
    const copy = [...rooms];
    if (sortBy === 'newest') {
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (sortBy === 'spots') {
      return copy.sort(
        (a, b) => b.maxParticipants - b.currentParticipants - (a.maxParticipants - a.currentParticipants),
      );
    }
    // Default: activity (participants count)
    return copy.sort((a, b) => b.currentParticipants - a.currentParticipants);
  }, [rooms, sortBy]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans">
      <StudyNavbar onOpenCreateModal={() => setCreateModalOpen(true)} />

      <main className="flex-1 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header & Controls */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-sand">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-terra">Live Discovery Board</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
                  />
                  {connected ? 'Live Sync Active' : 'Connecting...'}
                </span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl text-forest">
                Find a Study Room
              </h1>
              <p className="text-xs sm:text-sm text-muted mt-1">
                Active study rooms automatically update in real-time. Full rooms lock new joins.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                id="btn-refresh-rooms"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-sand bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-forest/5 transition-colors"
                title="Refresh rooms"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Sync
              </button>
              <button
                type="button"
                id="btn-create-room-discovery"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-forest px-4 py-2 text-xs font-semibold text-paper shadow-xs hover:bg-forest-deep transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Room
              </button>
            </div>
          </div>

          {/* Search Bar & Filters */}
          <div className="mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <input
                  type="text"
                  id="input-search-rooms"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by room name, subject, or focus topic..."
                  className="w-full rounded-sm border border-sand bg-surface pl-10 pr-24 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
                <svg
                  className="absolute left-3.5 top-3 h-4 w-4 text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      const next = new URLSearchParams(searchParams);
                      next.delete('search');
                      setSearchParams(next);
                    }}
                    className="absolute right-16 top-2.5 text-xs text-muted hover:text-forest"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 rounded-xs bg-forest px-3 py-1 text-xs font-semibold text-paper hover:bg-forest-deep"
                >
                  Search
                </button>
              </form>

              {/* Sort Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted hidden sm:inline">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'activity' | 'newest' | 'spots')}
                  className="rounded-sm border border-sand bg-surface px-3 py-2 text-xs font-medium text-ink focus:border-forest focus:outline-none"
                >
                  <option value="activity">Most Active</option>
                  <option value="newest">Newest First</option>
                  <option value="spots">Spots Available</option>
                </select>
              </div>
            </div>

            {/* Subject Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {FILTER_SUBJECTS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => handleSubjectChange(sub)}
                  className={`rounded-sm px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedSubject === sub
                      ? 'bg-forest text-paper shadow-2xs font-semibold'
                      : 'border border-sand bg-surface text-ink/80 hover:bg-forest/5'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>

            {/* Availability Filter Toggle Bar */}
            <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-sand/60">
              <div className="flex items-center gap-2">
                <span>Availability:</span>
                <div className="inline-flex rounded-sm border border-sand p-0.5 bg-surface">
                  <button
                    type="button"
                    onClick={() => handleAvailabilityChange('all')}
                    className={`px-2.5 py-0.5 rounded-xs font-medium transition-colors ${
                      selectedAvailability === 'all'
                        ? 'bg-forest/10 text-forest font-semibold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    All Rooms
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAvailabilityChange('available')}
                    className={`px-2.5 py-0.5 rounded-xs font-medium transition-colors ${
                      selectedAvailability === 'available'
                        ? 'bg-emerald-100 text-emerald-800 font-semibold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Spots Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAvailabilityChange('full')}
                    className={`px-2.5 py-0.5 rounded-xs font-medium transition-colors ${
                      selectedAvailability === 'full'
                        ? 'bg-rose-100 text-rose-800 font-semibold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Full Only
                  </button>
                </div>
              </div>

              <div>
                Showing <span className="font-semibold text-ink">{sortedRooms.length}</span> rooms
              </div>
            </div>
          </div>

          {/* Room Listings Grid */}
          <div className="mt-8">
            {error && (
              <div className="rounded-sm border border-terra/30 bg-terra/10 p-4 text-xs text-terra mb-6">
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-56 rounded-sm border border-sand bg-surface p-5 animate-pulse" />
                ))}
              </div>
            ) : sortedRooms.length === 0 ? (
              <div className="rounded-sm border border-dashed border-sand bg-surface p-12 text-center max-w-md mx-auto my-8">
                <div className="text-3xl mb-2">🔍</div>
                <h3 className="font-serif text-lg font-medium text-forest">No study rooms found</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  There are no active study rooms matching your current filters or query.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchParams(new URLSearchParams());
                    }}
                    className="rounded-sm border border-sand px-3 py-1.5 text-xs font-semibold text-ink hover:bg-forest/5"
                  >
                    Clear Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(true)}
                    className="rounded-sm bg-forest px-4 py-1.5 text-xs font-semibold text-paper"
                  >
                    Create This Room
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {sortedRooms.map((room) => (
                  <RoomCard key={room.id} room={room} currentUserId={profile.id} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Room Modal */}
      <CreateRoomModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </div>
  );
}

function RoomCard({ room, currentUserId }: { room: StudyRoom; currentUserId: string }) {
  const navigate = useNavigate();
  const isFull = room.currentParticipants >= room.maxParticipants;
  const isHost = room.hostId === currentUserId;
  const percentFilled = Math.min(100, Math.round((room.currentParticipants / room.maxParticipants) * 100));
  const spotsLeft = room.maxParticipants - room.currentParticipants;

  const diffMs = new Date(room.expiresAt).getTime() - Date.now();
  const remainingMins = Math.max(0, Math.floor(diffMs / 60000));
  const isExpiringSoon = remainingMins > 0 && remainingMins <= 5;
  const isExpired = remainingMins <= 0;

  return (
    <div className="flex flex-col justify-between rounded-sm border border-sand bg-surface p-5 shadow-2xs hover:border-forest/40 hover:shadow-xs transition-all duration-150">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-block rounded-xs bg-forest/8 px-2.5 py-0.5 text-[11px] font-semibold text-forest">
            {room.subject}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Countdown Expiry Badge */}
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs border flex items-center gap-1 transition-colors ${
                isExpired
                  ? 'border-rose-300 bg-rose-100 text-rose-800'
                  : isExpiringSoon
                    ? 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse'
                    : 'border-sand/70 bg-paper text-muted'
              }`}
              title="Room closes automatically when countdown reaches 00:00"
            >
              <span>⏳</span>
              <span>
                {isExpired ? 'Expired' : remainingMins < 60 ? `${remainingMins}m left` : `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m`}
              </span>
            </span>

            {/* Mode Pill */}
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted bg-paper px-2 py-0.5 rounded-xs border border-sand/50">
              {room.studyMode}
            </span>
          </div>
        </div>

        {/* Room Name */}
        <h3 className="font-serif text-lg font-medium text-forest hover:text-terra transition-colors line-clamp-1">
          {room.name}
        </h3>

        {/* Description */}
        {room.description ? (
          <p className="mt-1.5 text-xs text-muted line-clamp-2 leading-relaxed">
            {room.description}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted/60 italic">
            Collaborative study group for {room.subject}.
          </p>
        )}
      </div>

      <div className="mt-6 pt-3.5 border-t border-sand/70">
        {/* Live Capacity Meter */}
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted text-[11px] flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                isFull ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'
              }`}
            />
            {isFull ? (
              <span className="font-bold text-rose-700">Room at Maximum Limit</span>
            ) : spotsLeft === 1 ? (
              <span className="font-bold text-amber-700">Only 1 Spot Remaining!</span>
            ) : (
              <span>{spotsLeft} spots available</span>
            )}
          </span>
          <span className="font-mono font-bold text-xs text-forest">
            {room.currentParticipants} / {room.maxParticipants}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-sand/60 rounded-full h-1.5 overflow-hidden mb-4">
          <div
            className={`h-full transition-all duration-300 ${
              isFull ? 'bg-rose-500' : percentFilled >= 80 ? 'bg-amber-500' : 'bg-forest'
            }`}
            style={{ width: `${percentFilled}%` }}
          />
        </div>

        {/* Footer info & Join action */}
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted">
            Host: <span className="font-semibold text-ink">{isHost ? 'You (Host)' : room.hostName}</span>
          </div>

          <button
            type="button"
            id={`btn-join-room-${room.id}`}
            onClick={() => navigate(`/rooms/${room.id}`)}
            disabled={isFull || isExpired}
            className={`inline-flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-xs font-semibold transition-colors ${
              isExpired
                ? 'bg-sand/40 text-muted/60 cursor-not-allowed border border-sand'
                : isFull
                  ? 'bg-sand/60 text-muted/80 cursor-not-allowed border border-sand'
                  : 'bg-forest text-paper hover:bg-forest-deep shadow-2xs'
            }`}
          >
            {isExpired ? 'Expired' : isFull ? 'Locked (Full)' : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
}
