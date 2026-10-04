import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants';

/* The two real steps of a 360° try-on, in order. `styling` is the haircut
   being rendered onto the photo, `filming` the turnaround video being made
   from it — nothing here is an animation, so a stage only advances when its
   request has actually finished. */
export type TryOnStage = 'idle' | 'styling' | 'filming' | 'done';

export const TRY_ON_STAGES: Array<{ id: Exclude<TryOnStage, 'idle' | 'done'>; label: string }> = [
  { id: 'styling', label: 'Styling your hair' },
  { id: 'filming', label: 'Filming your 360° turn' },
];

/** A video the backend is still making. Kept for the session, so leaving the
    screen or reloading resumes the wait instead of losing a video that is
    already paid for. The poster is in IndexedDB under `posterKey`. */
export interface PendingVideo {
  /** The result's id once it lands — decided up front, so the poster and the
      clip are filed under the same one. */
  generationId: string;
  jobId: string;
  hairstyleId: string;
  hairstyleName: string;
  sourceKey: string;
  posterKey: string;
  videoModel: string;
}

interface TryOnStore {
  /** IndexedDB key of the photo currently in the try-on flow. */
  photoKey: string | null;
  selectedHairstyleId: string | null;
  stage: TryOnStage;
  pending: PendingVideo | null;
  setPhotoKey: (key: string | null) => void;
  setSelectedHairstyle: (id: string | null) => void;
  setStage: (stage: TryOnStage) => void;
  setPending: (pending: PendingVideo | null) => void;
  reset: () => void;
}

export const useTryOnStore = create<TryOnStore>()(
  persist(
    (set) => ({
      photoKey: null,
      selectedHairstyleId: null,
      stage: 'idle',
      pending: null,

      setPhotoKey: (photoKey) => set({ photoKey }),
      setSelectedHairstyle: (selectedHairstyleId) => set({ selectedHairstyleId }),
      setStage: (stage) => set({ stage }),
      setPending: (pending) => set({ pending }),
      reset: () => set({ photoKey: null, selectedHairstyleId: null, stage: 'idle', pending: null }),
    }),
    {
      name: STORAGE_KEYS.tryOn,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        photoKey: state.photoKey,
        selectedHairstyleId: state.selectedHairstyleId,
        pending: state.pending,
      }),
    },
  ),
);
