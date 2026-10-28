import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudyMode } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useStudentProfile } from '@/lib/studentSession';
import { useToast } from '@/lib/toast';

const POPULAR_SUBJECTS = [
  'Mathematics',
  'Computer Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Engineering',
  'Literature & Languages',
  'Medicine & Health',
  'Exam Preparation',
];

const STUDY_MODES: { id: StudyMode; label: string; desc: string; icon: string }[] = [
  {
    id: 'pomodoro',
    label: 'Pomodoro Sprint',
    desc: '25m focus blocks with synchronized 5m breaks',
    icon: '⏱️',
  },
  {
    id: 'focus',
    label: 'Silent Deep Focus',
    desc: 'Distraction-free environment for independent study',
    icon: '🧠',
  },
  {
    id: 'discussion',
    label: 'Group Problem Solving',
    desc: 'Collaborative problem solving and concept debate',
    icon: '💡',
  },
  {
    id: 'cram',
    label: 'Exam Cram Marathon',
    desc: 'Intensive revision and review session',
    icon: '⚡',
  },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15m Sprint', desc: 'Quick check-in' },
  { value: 25, label: '25m Focus', desc: '1 Pomodoro cycle' },
  { value: 45, label: '45m Session', desc: 'Deep solving' },
  { value: 60, label: '60m Standard', desc: '1 hour study' },
  { value: 90, label: '90m Intensive', desc: '1.5 hrs deep work' },
  { value: 120, label: '120m Marathon', desc: '2 hrs review' },
];

export function CreateRoomModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useStudentProfile();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [customSubject, setCustomSubject] = useState('');
  const [description, setDescription] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(5);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [studyMode, setStudyMode] = useState<StudyMode>('pomodoro');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalSubject = subject === 'Other' ? customSubject.trim() : subject;
    if (!name.trim()) {
      setError('Please provide a descriptive room name.');
      return;
    }
    if (!finalSubject) {
      setError('Please specify a subject.');
      return;
    }
    if (maxParticipants < 2 || maxParticipants > 25) {
      setError('Participant limit must be between 2 and 25.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api<{ room: { id: string } }>('/study/rooms', {
        method: 'POST',
        body: {
          name: name.trim(),
          subject: finalSubject,
          description: description.trim() || undefined,
          maxParticipants,
          durationMinutes,
          visibility,
          studyMode,
          userId: profile.id,
          userName: profile.name,
          userAvatar: profile.avatarColor,
        },
      });

      toast.push(`Room "${name.trim()}" is now live!`, 'success');

      onClose();
      navigate(`/rooms/${res.room.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-sm border border-sand bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-sand">
          <div>
            <h2 className="font-serif text-xl font-medium text-forest">Create a Study Room</h2>
            <p className="text-xs text-muted mt-0.5">
              Set up a live, temporary collaborative space for your subject.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted hover:text-forest transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-sm border border-terra/30 bg-terra/10 p-3 text-xs text-terra">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Room Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest mb-1">
              Room Name <span className="text-terra">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Calculus III Problem Set Marathon"
              maxLength={80}
              required
              className="w-full rounded-sm border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest mb-1">
              Subject <span className="text-terra">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-2">
              {POPULAR_SUBJECTS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubject(sub)}
                  className={`px-2.5 py-1.5 text-xs text-left rounded-sm border transition-colors ${
                    subject === sub
                      ? 'border-forest bg-forest/10 font-semibold text-forest'
                      : 'border-sand bg-surface text-ink/80 hover:bg-forest/5'
                  }`}
                >
                  {sub}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSubject('Other')}
                className={`px-2.5 py-1.5 text-xs text-left rounded-sm border transition-colors ${
                  subject === 'Other'
                    ? 'border-forest bg-forest/10 font-semibold text-forest'
                    : 'border-sand bg-surface text-ink/80 hover:bg-forest/5'
                }`}
              >
                + Custom Subject
              </button>
            </div>

            {subject === 'Other' && (
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Type your subject (e.g. Constitutional Law)"
                maxLength={50}
                required
                className="w-full rounded-sm border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
              />
            )}
          </div>

          {/* Study Mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest mb-1">
              Study Focus Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STUDY_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setStudyMode(mode.id)}
                  className={`flex items-start gap-2.5 p-2.5 text-left rounded-sm border transition-all ${
                    studyMode === mode.id
                      ? 'border-forest bg-forest/5 ring-1 ring-forest'
                      : 'border-sand bg-surface hover:border-forest/30'
                  }`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{mode.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-forest">{mode.label}</div>
                    <div className="text-[11px] text-muted leading-tight mt-0.5">{mode.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Max Capacity Limit */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-forest">
                Max Participant Limit
              </label>
              <span className="text-xs font-bold font-mono text-forest bg-forest/10 px-2 py-0.5 rounded-sm">
                {maxParticipants} Students
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="w-full accent-forest cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>2 (Pair Focus)</span>
              <span>5 (Optimal Study Group)</span>
              <span>20 (Lecture/Open Hall)</span>
            </div>
          </div>

          {/* Room Expiry Countdown / Session Duration */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-forest">
                Room Expiry Countdown
              </label>
              <span className="text-xs font-bold font-mono text-terracotta bg-terracotta/10 px-2 py-0.5 rounded-sm">
                ⏳ {durationMinutes} Minutes
              </span>
            </div>
            <p className="text-[11px] text-muted mb-2">
              The study room will tick down and automatically close for all participants when the timer reaches 00:00.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationMinutes(opt.value)}
                  className={`p-2 rounded-sm border text-left transition-all ${
                    durationMinutes === opt.value
                      ? 'border-forest bg-forest/10 font-bold text-forest ring-1 ring-forest'
                      : 'border-sand bg-surface text-ink/80 hover:border-forest/30'
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-muted">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Description / Goal */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-forest mb-1">
              Goal or Topic Overview <span className="text-muted font-normal">(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Covering Chapter 4 problems 1 to 15. Bring your formula sheet!"
              rows={2}
              maxLength={250}
              className="w-full rounded-sm border border-sand bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center justify-between pt-2 border-t border-sand">
            <div>
              <span className="block text-xs font-semibold text-forest">Public Discovery</span>
              <span className="block text-[11px] text-muted">
                {visibility === 'public'
                  ? 'Listed on the Room Discovery board for all students to join'
                  : 'Only students with direct link can join'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setVisibility(visibility === 'public' ? 'unlisted' : 'public')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                visibility === 'public' ? 'bg-forest' : 'bg-sand'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  visibility === 'public' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-sand">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-sm border border-sand px-4 py-2 text-xs font-semibold text-ink hover:bg-forest/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-sm bg-forest px-5 py-2 text-xs font-semibold text-paper shadow-xs hover:bg-forest-deep transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating Room...' : 'Launch Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
