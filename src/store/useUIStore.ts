import { create } from "zustand";

/**
 * Zustand store for ephemeral, cross-component UI state that
 * doesn't belong in React Context (no persistence/async loading
 * involved) — sidebar collapse, active modal, global search open
 * state. Server/domain data (auth, workspace, theme) stays in
 * Context so it can be loaded/derived from Firebase; this store is
 * purely client-side UI flags.
 */
interface UIState {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  isMobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;

  activeModal: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;

  isSearchOpen: boolean;
  setSearchOpen: (value: boolean) => void;

  projectViewMode: "grid" | "list";
  setProjectViewMode: (mode: "grid" | "list") => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  setSidebarCollapsed: (value) => set({ isSidebarCollapsed: value }),

  isMobileNavOpen: false,
  setMobileNavOpen: (value) => set({ isMobileNavOpen: value }),

  activeModal: null,
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  isSearchOpen: false,
  setSearchOpen: (value) => set({ isSearchOpen: value }),

  projectViewMode: "grid",
  setProjectViewMode: (mode) => set({ projectViewMode: mode }),
}));
