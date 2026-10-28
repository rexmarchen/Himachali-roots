import { useMemo, useState } from 'react';
import { useAuth } from './session';

export interface StudentProfile {
  id: string;
  name: string;
  avatarColor: string;
  isRegistered: boolean;
}

const STORAGE_KEY = 'study_student_profile';

const AVATAR_COLORS = [
  '#243D32', // forest
  '#C77759', // terra
  '#4A6B5D', // sage
  '#8E3B2B', // rust
  '#2B4C6F', // navy
  '#6B4A65', // plum
  '#B57C1E', // amber
];

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function generateGuestId(): string {
  return 'std_' + Math.random().toString(36).substring(2, 10);
}

const DEFAULT_NAMES = [
  'Aarav Patel',
  'Priya Sharma',
  'Rohan Mehta',
  'Ananya Iyer',
  'Kabir Das',
  'Meera Nair',
  'Siddharth Rao',
  'Isha Gupta',
];

function getRandomName(): string {
  return DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
}

/**
 * Get the current student identity synchronously from storage or defaults
 */
export function getStoredStudentProfile(): StudentProfile {
  if (typeof window === 'undefined') {
    return { id: 'guest_default', name: 'Student', avatarColor: AVATAR_COLORS[0], isRegistered: false };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.id && parsed.name) {
        return parsed;
      }
    }
  } catch {
    // ignore json error
  }

  const newProfile: StudentProfile = {
    id: generateGuestId(),
    name: getRandomName(),
    avatarColor: getRandomColor(),
    isRegistered: false,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
  } catch {
    // ignore
  }

  return newProfile;
}

/**
 * React hook that binds to both logged-in user auth and guest student profile
 */
export function useStudentProfile() {
  const { user } = useAuth();
  const [guestProfile, setGuestProfile] = useState<StudentProfile>(getStoredStudentProfile);

  const profile = useMemo<StudentProfile>(() => {
    if (user) {
      return {
        id: user.id,
        name: user.fullName || user.email.split('@')[0],
        avatarColor: guestProfile.avatarColor || AVATAR_COLORS[0],
        isRegistered: true,
      };
    }
    return guestProfile;
  }, [user, guestProfile]);

  const updateName = (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const updated = { ...guestProfile, name: trimmed };
    setGuestProfile(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const updateAvatarColor = (color: string) => {
    const updated = { ...guestProfile, avatarColor: color };
    setGuestProfile(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  return { profile, updateName, updateAvatarColor, colors: AVATAR_COLORS };
}
