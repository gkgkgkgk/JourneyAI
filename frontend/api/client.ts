import axios from 'axios';
import { Platform } from 'react-native';

export const BASE_URL = Platform.select({
    android: 'http://10.0.2.2:8000',
    ios: 'http://localhost:8000',
    default: 'http://localhost:8000',
});

export const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const uploadFile = async (file: any) => {
    const formData = new FormData();

    if (Platform.OS === 'web') {
        // On web, if the file object is available (from document picker), use it directly.
        // Expo Document Picker result.assets[0].file is the File object on web.
        if (file.file) {
            formData.append('file', file.file);
        } else {
            // Fallback if structure is different, though usually .file exists on web asset
            // Create a blob from uri if necessary, but typically unnecessary with modern pickers
            const response = await fetch(file.uri);
            const blob = await response.blob();
            formData.append('file', blob, file.name);
        }
    } else {
        // Native (iOS/Android) needs this specific object structure
        formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: file.mimeType || 'application/octet-stream',
        } as any);
    }

    try {
        const response = await apiClient.post('/api/sources/upload', formData, {
            headers: {
                // 'Content-Type': 'multipart/form-data', // Let browser set this with boundary
            },
            transformRequest: (data, headers) => {
                return data; // Prevent Axios from serializing FormData
            }
        });
        return response.data;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
};

export const getSources = async () => {
    try {
        const response = await apiClient.get('/api/sources/');
        return response.data;
    } catch (error) {
        console.error('Fetch sources failed:', error);
        throw error;
    }
};

export const deleteSource = async (id: string) => {
    try {
        await apiClient.delete(`/api/sources/${id}`);
    } catch (error) {
        console.error('Delete source failed:', error);
        throw error;
    }
};

export const updateSource = async (id: string, data: any) => {
    try {
        const response = await apiClient.patch(`/api/sources/${id}`, data);
        return response.data;
    } catch (error) {
        console.error('Update source failed:', error);
        throw error;
    }
};

export const transcribeSource = async (id: string) => {
    try {
        const response = await apiClient.post(`/api/sources/${id}/transcribe`);
        return response.data;
    } catch (error) {
        console.error('Transcribe source failed:', error);
        throw error;
    }
};

export const indexSource = async (id: string) => {
    try {
        const response = await apiClient.post(`/api/sources/${id}/index`);
        return response.data;
    } catch (error) {
        console.error('Index source failed:', error);
        throw error;
    }
};

export async function* streamChat(
    messages: { role: string; content: string }[]
): AsyncGenerator<any> {
    const response = await fetch(`${BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
    });
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try { yield JSON.parse(line.slice(6)); } catch {}
            }
        }
    }
}

export async function* streamSSE(path: string): AsyncGenerator<any> {
    const response = await fetch(`${BASE_URL}${path}`, { method: 'POST' });
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try { yield JSON.parse(line.slice(6)); } catch {}
            }
        }
    }
}

// Notes API
export const getNotes = async () => {
    const response = await apiClient.get('/api/notes/');
    return response.data;
};

export const createNote = async (data: { title?: string; content?: string; note_type?: string }) => {
    const response = await apiClient.post('/api/notes/', data);
    return response.data;
};

export const kickstartNote = async (data: {
    prompt: string;
    note_type: string;
    length: string;
    format: string;
}) => {
    const response = await apiClient.post('/api/notes/kickstart', data);
    return response.data;
};

export const updateNote = async (id: string, data: { title?: string; content?: string; note_type?: string }) => {
    const response = await apiClient.patch(`/api/notes/${id}`, data);
    return response.data;
};

export const deleteNote = async (id: string) => {
    await apiClient.delete(`/api/notes/${id}`);
};

export const getNoteFeedback = async (id: string) => {
    const response = await apiClient.post(`/api/notes/${id}/feedback`);
    return response.data;
};

// Settings API
export const getSettings = async () => {
    const response = await apiClient.get('/api/settings/');
    return response.data;
};

export const updateSettings = async (data: { theme?: string; system_prompt?: string; reading_notes?: string }) => {
    const response = await apiClient.patch('/api/settings/', data);
    return response.data;
};

// Source Search API

export interface SourceSearchResult {
    id: string;
    title: string;
    summary: string;
    keywords: string[];
    people: string[];
    locations: string[];
    transcription: string | null;
    score: number;
}

export async function searchSources(query: string, limit = 5): Promise<SourceSearchResult[]> {
    try {
        const response = await apiClient.post('/api/sources/search', { query, limit });
        return response.data as SourceSearchResult[];
    } catch (error) {
        console.error('Source search failed:', error);
        throw error;
    }
}

// Citation Analysis API
export interface CitationAnalysis {
    supported: 'yes' | 'partial' | 'no';
    verdict: string;
    completion: string;
    next_sentence: string;
}

export async function analyzeCitation(text: string, source_ids: string[]): Promise<CitationAnalysis> {
    const response = await apiClient.post('/api/cite/analyze', { text, source_ids });
    return response.data as CitationAnalysis;
}

// Chapters API
export const getChapters = async () => {
    const response = await apiClient.get('/api/chapters/');
    return response.data;
};

export const createChapter = async (data: { title?: string; content?: string }) => {
    const response = await apiClient.post('/api/chapters/', data);
    return response.data;
};

export const updateChapter = async (id: string, data: { title?: string; content?: string }) => {
    const response = await apiClient.patch(`/api/chapters/${id}`, data);
    return response.data;
};

export const reorderChapter = async (id: string, order_index: number) => {
    const response = await apiClient.patch(`/api/chapters/${id}/reorder`, { order_index });
    return response.data;
};

export const deleteChapter = async (id: string) => {
    await apiClient.delete(`/api/chapters/${id}`);
};
