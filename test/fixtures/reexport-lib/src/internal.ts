export interface UserProfile {
  id: string;
}

export function createProfile(id: string): UserProfile {
  return { id };
}

