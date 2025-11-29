import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { authAPI } from '../services/api';
import enTranslations from '../locales/en.json';
import hiTranslations from '../locales/hi.json';
import taTranslations from '../locales/ta.json';
import teTranslations from '../locales/te.json';

type Language = 'en' | 'hi' | 'ta' | 'te';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, any> = {
  en: enTranslations,
  hi: hiTranslations,
  ta: taTranslations,
  te: teTranslations,
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  
  // Load language from localStorage first, then sync with user preference
  const getInitialLanguage = (): Language => {
    const savedLang = localStorage.getItem('language_preference') as Language;
    if (savedLang && ['en', 'hi', 'ta', 'te'].includes(savedLang)) {
      return savedLang;
    }
    return 'en';
  };
  
  const [language, setLanguageState] = useState<Language>(getInitialLanguage());
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const pendingLanguageRef = useRef<Language | null>(null);
  const lastSyncedLanguageRef = useRef<Language | null>(null);

  // Load language from user preference ONLY on initial mount
  // After that, only sync if user explicitly changes it, not on every user object update
  useEffect(() => {
    // Don't sync if user is actively changing language
    if (isChangingLanguage) return;
    
    // Don't sync if we have a pending language change
    if (pendingLanguageRef.current !== null) return;
    
    // Only sync on initial load (when not initialized yet)
    if (!isInitialized && user?.language_preference) {
      const userLang = user.language_preference as Language;
      if (['en', 'hi', 'ta', 'te'].includes(userLang)) {
        setLanguageState(userLang);
        localStorage.setItem('language_preference', userLang);
        lastSyncedLanguageRef.current = userLang;
        setIsInitialized(true);
        return;
      }
    }
    
    // If initialized and user object has a different language preference than what we last synced,
    // AND it's different from current, update it (this handles backend updates)
    if (isInitialized && user?.language_preference) {
      const userLang = user.language_preference as Language;
      if (['en', 'hi', 'ta', 'te'].includes(userLang) && 
          userLang !== lastSyncedLanguageRef.current &&
          userLang !== language) {
        // Only update if it's actually different from what we have
        setLanguageState(userLang);
        localStorage.setItem('language_preference', userLang);
        lastSyncedLanguageRef.current = userLang;
        return;
      }
    }
    
    // Mark as initialized after first check
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [user, user?.language_preference, isChangingLanguage, isInitialized, language]);

  const setLanguage = async (lang: Language) => {
    // Update state immediately for instant UI feedback
    setIsChangingLanguage(true);
    pendingLanguageRef.current = lang;
    setLanguageState(lang);
    // Save to localStorage immediately for persistence
    localStorage.setItem('language_preference', lang);
    
    try {
      // Save to backend - the response contains the updated user object
      const updatedUser = await authAPI.updateUser({
        language_preference: lang,
      });
      
      // Verify the updated user has the correct language preference
      // The backend should return the updated user with the new language_preference
      if (updatedUser?.language_preference === lang) {
        // Backend has the correct value, update last synced ref
        lastSyncedLanguageRef.current = lang;
        // Refresh user but don't let it override our language state
        await refreshUser();
        pendingLanguageRef.current = null;
        setIsChangingLanguage(false);
      } else {
        // If for some reason the response doesn't match, wait a bit and check again
        // This handles edge cases where the backend might have a slight delay
        setTimeout(async () => {
          await refreshUser();
          const finalUser = await authAPI.getCurrentUser();
          if (finalUser?.language_preference === lang) {
            lastSyncedLanguageRef.current = lang;
            pendingLanguageRef.current = null;
            setIsChangingLanguage(false);
          } else {
            // Even if backend doesn't match (shouldn't happen), clear to avoid infinite loop
            // The language state is already set correctly and saved to localStorage, so it should persist
            lastSyncedLanguageRef.current = lang;
            pendingLanguageRef.current = null;
            setIsChangingLanguage(false);
          }
        }, 200);
      }
    } catch (err: any) {
      console.error('Error saving language preference:', err);
      // Don't revert - keep the language the user selected (it's saved in localStorage)
      // The language state is already set correctly
      lastSyncedLanguageRef.current = lang;
      pendingLanguageRef.current = null;
      setIsChangingLanguage(false);
    }
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Fallback to English if translation not found
        value = translations.en;
        for (const k2 of keys) {
          if (value && typeof value === 'object') {
            value = value[k2];
          } else {
            return key;
          }
        }
        return value || key;
      }
    }
    
    return value || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

