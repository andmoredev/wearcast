// Service to manage user ID from localStorage
const USER_ID_STORAGE_KEY = 'chatbot_user_id';
const DEFAULT_USER_ID = 'default-user';

export const getUserId = (): string => {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_ID;
  }
  
  const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
  return stored || DEFAULT_USER_ID;
};

export const setUserId = (userId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  
  if (userId === DEFAULT_USER_ID || userId.trim() === '') {
    localStorage.removeItem(USER_ID_STORAGE_KEY);
  } else {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  }
  
  // Dispatch custom event for same-tab updates
  window.dispatchEvent(new Event('userIdChanged'));
};

export const resetUserId = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  
  localStorage.removeItem(USER_ID_STORAGE_KEY);
  
  // Dispatch custom event for same-tab updates
  window.dispatchEvent(new Event('userIdChanged'));
};

export const isCustomUserId = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
  return stored !== null && stored !== DEFAULT_USER_ID;
};
