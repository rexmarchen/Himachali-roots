import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/session';
import { useStudentProfile } from '@/lib/studentSession';

export function StudyNavbar({ onOpenCreateModal }: { onOpenCreateModal?: () => void }) {
  const { user, signOut } = useAuth();
  const { profile, updateName, updateAvatarColor, colors } = useStudentProfile();
  const location = useLocation();

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingName, setEditingName] = useState(profile.name);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateName(editingName);
    setProfileModalOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-sand/80 bg-paper/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-8">
            <Link to="/" className="group flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-forest text-paper shadow-xs transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  <path d="M6 6h10" />
                  <path d="M6 10h10" />
                  <path d="M12 2v20" />
                </svg>
              </div>
              <div className="leading-tight">
                <span className="block font-serif text-lg font-medium tracking-tight text-forest group-hover:text-terra transition-colors">
                  StudyHub
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Room Finder
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors ${
                  isActive('/') ? 'bg-forest/10 text-forest' : 'text-ink/80 hover:text-forest hover:bg-forest/5'
                }`}
              >
                Overview
              </Link>
              <Link
                to="/rooms"
                className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors ${
                  isActive('/rooms') ? 'bg-forest/10 text-forest' : 'text-ink/80 hover:text-forest hover:bg-forest/5'
                }`}
              >
                Find Rooms
              </Link>
            </nav>
          </div>

          {/* Action CTA & Profile */}
          <div className="flex items-center gap-3">
            {onOpenCreateModal ? (
              <button
                type="button"
                onClick={onOpenCreateModal}
                className="hidden sm:inline-flex items-center gap-2 rounded-sm bg-terra px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#b9694c] transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Room
              </button>
            ) : (
              <Link
                to="/rooms"
                className="hidden sm:inline-flex items-center gap-2 rounded-sm bg-terra px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#b9694c] transition-colors"
              >
                Find a Room
              </Link>
            )}

            {/* Student Profile Quick Switcher */}
            <button
              type="button"
              onClick={() => {
                setEditingName(profile.name);
                setProfileModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-sm border border-sand bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-2xs hover:border-forest/40 transition-colors"
              title="Click to change your student display name"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-2xs"
                style={{ backgroundColor: profile.avatarColor }}
              >
                {profile.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden md:block max-w-[120px] truncate">{profile.name}</span>
              <span className="text-[10px] text-muted">✏️</span>
            </button>

            {/* Registered Auth Status */}
            {user ? (
              <button
                type="button"
                onClick={() => signOut()}
                className="text-xs text-muted hover:text-terra transition-colors hidden sm:inline"
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/login"
                className="text-xs font-medium text-muted hover:text-forest transition-colors hidden sm:inline"
              >
                Sign in
              </Link>
            )}

            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-forest rounded-sm hover:bg-forest/5"
              aria-label="Toggle navigation menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="border-t border-sand bg-paper p-4 md:hidden flex flex-col gap-2.5">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-forest hover:text-terra py-1"
            >
              Overview
            </Link>
            <Link
              to="/rooms"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-forest hover:text-terra py-1"
            >
              Find Study Rooms
            </Link>
            {onOpenCreateModal && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCreateModal();
                }}
                className="text-left text-sm font-semibold text-terra py-1"
              >
                + Create New Room
              </button>
            )}
          </div>
        )}
      </header>

      {/* Student Profile Customizer Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div
            ref={modalRef}
            className="w-full max-w-sm rounded-sm border border-sand bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-4 border-b border-sand">
              <h3 className="font-serif text-lg font-medium text-forest">Student Profile</h3>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="text-muted hover:text-forest text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-forest mb-1">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  maxLength={40}
                  required
                  placeholder="e.g. Maya Chen"
                  className="w-full rounded-sm border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Other participants will see this name when you join study rooms.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-forest mb-1.5">
                  Avatar Color
                </label>
                <div className="flex items-center gap-2">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateAvatarColor(c)}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        profile.avatarColor === c ? 'scale-115 ring-2 ring-forest ring-offset-2' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-sand">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="rounded-sm border border-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-forest/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-sm bg-forest px-4 py-1.5 text-xs font-semibold text-paper hover:bg-forest-deep"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
