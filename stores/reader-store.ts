import { create } from "zustand";

/**
 * Reader Store
 * 
 * Zustand store for reader state management.
 * Tracks current segment, mode toggle, and offline status.
 */

interface ReaderState {
    // Current segment being viewed
    currentSegmentId: string | null;
    setCurrentSegmentId: (id: string | null) => void;

    // Deep/Quick mode toggle
    isDeepMode: boolean;
    toggleMode: () => void;
    setDeepMode: (isDeep: boolean) => void;

    // Offline availability
    isOfflineAvailable: boolean;
    setOfflineAvailable: (available: boolean) => void;

    // Sidebar visibility (mobile)
    isSidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;

    // Tools panel visibility (mobile)
    isToolsPanelOpen: boolean;
    setToolsPanelOpen: (open: boolean) => void;
    toggleToolsPanel: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
    // Current segment
    currentSegmentId: null,
    setCurrentSegmentId: (id) => set({ currentSegmentId: id }),

    // Mode toggle
    isDeepMode: true, // Default to Deep Mode
    toggleMode: () => set((state) => ({ isDeepMode: !state.isDeepMode })),
    setDeepMode: (isDeep) => set({ isDeepMode: isDeep }),

    // Offline
    isOfflineAvailable: false,
    setOfflineAvailable: (available) => set({ isOfflineAvailable: available }),

    // Sidebar
    isSidebarOpen: false,
    setSidebarOpen: (open) => set({ isSidebarOpen: open }),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

    // Tools panel
    isToolsPanelOpen: false,
    setToolsPanelOpen: (open) => set({ isToolsPanelOpen: open }),
    toggleToolsPanel: () =>
        set((state) => ({ isToolsPanelOpen: !state.isToolsPanelOpen })),
}));
