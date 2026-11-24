"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  SUPPORTED_AI_LANGUAGES,
  translations,
} from "./translations";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  aiLanguage: string;
  setAiLanguage: (lang: string) => Promise<void>;
  dir: "ltr" | "rtl";
  t: (key: string, fallback?: string) => string;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
  supportedAiLanguages: typeof SUPPORTED_AI_LANGUAGES;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>("en");
  const [aiLanguage, setAiLanguageState] = useState<string>("auto");
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize from localStorage or user profile
  useEffect(() => {
    const savedLang = localStorage.getItem("campusvault_lang") as SupportedLanguage;
    if (savedLang && translations[savedLang]) {
      setLanguageState(savedLang);
    }

    const savedAiLang = localStorage.getItem("campusvault_ai_lang");
    if (savedAiLang) {
      setAiLanguageState(savedAiLang);
    }

    // Fetch user profile preferences from server
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          const u = data.data.user;
          setUserId(u.id);
          if (u.websiteLanguage && translations[u.websiteLanguage as SupportedLanguage]) {
            setLanguageState(u.websiteLanguage as SupportedLanguage);
            localStorage.setItem("campusvault_lang", u.websiteLanguage);
          }
          if (u.aiLanguage) {
            setAiLanguageState(u.aiLanguage);
            localStorage.setItem("campusvault_ai_lang", u.aiLanguage);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Update HTML tag dir and lang attributes when language changes
  useEffect(() => {
    const meta = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    const dir = meta ? meta.dir : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (newLang: SupportedLanguage) => {
      setLanguageState(newLang);
      localStorage.setItem("campusvault_lang", newLang);

      // Persist to DB if logged in
      if (userId) {
        try {
          await fetch(`/api/users/${userId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ websiteLanguage: newLang }),
          });
        } catch (err) {
          console.error("Failed to persist website language preference", err);
        }
      }
    },
    [userId]
  );

  const setAiLanguage = useCallback(
    async (newAiLang: string) => {
      setAiLanguageState(newAiLang);
      localStorage.setItem("campusvault_ai_lang", newAiLang);

      // Persist to DB if logged in
      if (userId) {
        try {
          await fetch(`/api/users/${userId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aiLanguage: newAiLang }),
          });
        } catch (err) {
          console.error("Failed to persist AI language preference", err);
        }
      }
    },
    [userId]
  );

  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const currentDict = translations[language];
      if (currentDict && currentDict[key]) {
        return currentDict[key];
      }
      // Fallback to English
      const enDict = translations.en;
      if (enDict && enDict[key]) {
        return enDict[key];
      }
      return fallback || key;
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        aiLanguage,
        setAiLanguage,
        dir,
        t,
        supportedLanguages: SUPPORTED_LANGUAGES,
        supportedAiLanguages: SUPPORTED_AI_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
