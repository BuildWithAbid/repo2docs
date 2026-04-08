export interface UserProfile {
  id: string;
}

export function createProfile(id: string): UserProfile {
  return { id };
}

export function $buildProfile(id: string): UserProfile {
  return { id };
}
