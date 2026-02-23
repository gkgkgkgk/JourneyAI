import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { getSettings } from '@/api/client';

export type JourneyStage = 'VAULT' | 'FORGE' | 'MANUSCRIPT' | 'SETTINGS';

interface JourneyContextType {
    stage: JourneyStage;
    setStage: (stage: JourneyStage) => void;
    systemPrompt: string;
    setSystemPrompt: (v: string) => void;
    readingNotes: string;
    setReadingNotes: (v: string) => void;
    theme: 'dark' | 'light';
    setTheme: (v: 'dark' | 'light') => void;
}

const JourneyContext = createContext<JourneyContextType | undefined>(undefined);

export function JourneyProvider({ children }: { children: ReactNode }) {
    const [stage, setStage] = useState<JourneyStage>('VAULT');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [readingNotes, setReadingNotes] = useState('');
    const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        getSettings()
            .then(s => {
                if (s.theme === 'dark' || s.theme === 'light') applyTheme(s.theme);
                if (s.system_prompt) setSystemPrompt(s.system_prompt);
                if (s.reading_notes) setReadingNotes(s.reading_notes);
            })
            .catch(() => { /* use defaults */ });
    }, []);

    const applyTheme = (t: 'dark' | 'light') => {
        setThemeState(t);
        try {
            Appearance.setColorScheme(t);
        } catch {
            // Not supported on all platforms — context value is the fallback
        }
    };

    const setTheme = (t: 'dark' | 'light') => applyTheme(t);

    return (
        <JourneyContext.Provider value={{ stage, setStage, systemPrompt, setSystemPrompt, readingNotes, setReadingNotes, theme, setTheme }}>
            {children}
        </JourneyContext.Provider>
    );
}

export function useJourney() {
    const context = useContext(JourneyContext);
    if (context === undefined) throw new Error('useJourney must be used within a JourneyProvider');
    return context;
}

/** Drop-in replacement for useColorScheme() that respects the in-app theme override. */
export function useAppColorScheme(): 'dark' | 'light' {
    const ctx = useContext(JourneyContext);
    const system = useColorScheme();
    return ctx?.theme ?? system ?? 'dark';
}
