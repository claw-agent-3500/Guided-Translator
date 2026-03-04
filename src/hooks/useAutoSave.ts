/**
 * useAutoSave Hook
 * React hook for integrating auto-save functionality into components.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    startAutoSave,
    stopAutoSave,
    saveState,
    loadState,
    clearState,
    hasSavedState,
    markDirty,
    getTimeSinceLastSave,
    SavedState,
} from '../services/autoSave';

interface UseAutoSaveOptions {
    /** Callback to get current state for saving */
    getState: () => Partial<SavedState>;
    /** Called when state is restored */
    onRestore?: (state: SavedState) => void;
    /** Auto-start saving on mount */
    autoStart?: boolean;
}

interface UseAutoSaveReturn {
    /** Whether there's a saved state available */
    hasSaved: boolean;
    /** Time since last save (formatted string) */
    lastSaved: string | null;
    /** Whether auto-save is currently active */
    isActive: boolean;
    /** Start auto-save */
    start: () => void;
    /** Stop auto-save */
    stop: () => void;
    /** Manually trigger a save */
    save: () => void;
    /** Load saved state */
    load: () => SavedState | null;
    /** Clear saved state */
    clear: () => void;
    /** Mark state as needing save */
    markChanged: () => void;
}

export function useAutoSave({
    getState,
    onRestore,
    autoStart = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
    const [hasSaved, setHasSaved] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [isActive, setIsActive] = useState(false);
    const getStateRef = useRef(getState);

    // Keep getState ref updated
    useEffect(() => {
        getStateRef.current = getState;
    }, [getState]);

    // Check for saved state on mount
    useEffect(() => {
        setHasSaved(hasSavedState());
        setLastSaved(getTimeSinceLastSave());
    }, []);

    // Update lastSaved periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setLastSaved(getTimeSinceLastSave());
        }, 10000); // Update every 10 seconds

        return () => clearInterval(interval);
    }, []);

    const start = useCallback(() => {
        startAutoSave(() => getStateRef.current());
        setIsActive(true);
    }, []);

    const stop = useCallback(() => {
        stopAutoSave();
        setIsActive(false);
    }, []);

    const save = useCallback(() => {
        const state = getStateRef.current();
        saveState(state);
        setLastSaved('just now');
        setHasSaved(true);
    }, []);

    const load = useCallback(() => {
        const state = loadState();
        if (state && onRestore) {
            onRestore(state);
        }
        return state;
    }, [onRestore]);

    const clear = useCallback(() => {
        clearState();
        setHasSaved(false);
        setLastSaved(null);
    }, []);

    const markChanged = useCallback(() => {
        markDirty();
    }, []);

    // Auto-start on mount
    useEffect(() => {
        if (autoStart) {
            start();
        }
        return () => stop();
    }, [autoStart, start, stop]);

    return {
        hasSaved,
        lastSaved,
        isActive,
        start,
        stop,
        save,
        load,
        clear,
        markChanged,
    };
}
