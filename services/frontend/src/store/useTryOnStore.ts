import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CapturedAngle, TryOnAnalysis } from '../types';
import { STORAGE_KEYS } from '../constants';

/* The two real steps of a try-on, in order. `analyzing` is one vision call at
   the AI service, `generating` is one image edit — nothing here is an
   animation, so a stage only advances when its request has actually finished. */
export type TryOnStage = 'idle' | 'analyzing' | 'generating' | 'done';

export const TRY_ON_STAGES: Array<{ id: Exclude<TryOnStage, 'idle' | 'done'>; label: string }> = [
  { id: 'analyzing', label: 'Reading your face and hair' },
  { id: 'generating', label: 'Rendering the style on your photo' },
];

/** Which of the two try-ons is in progress. `single` is the original one photo
    in, one render out; `360` reads the whole ring and renders several views.
    Everything downstream branches on this one field. */
export type TryOnMode = 'single' | '360';

interface TryOnStore {
  /** IndexedDB key of the photo currently in the try-on flow. In a 360 run
      this is the front capture, so every screen that only knows about one
      photo keeps working. */
  photoKey: string | null;
  mode: TryOnMode;
  /** The captured ring, front first. Empty in a single-photo run. */
  angles: CapturedAngle[];
  selectedHairstyleId: string | null;
  stage: TryOnStage;
  /** What the AI read from `photoKey`. Kept so moving back and forth through
      the flow does not pay for the same analysis twice. */
  analysis: TryOnAnalysis | null;
  /** `ApiError.code` from the last failed analysis, so the screen can explain
      itself after a reload. */
  analysisError: string | null;
  setPhotoKey: (key: string | null) => void;
  /** Hands the whole captured ring over at once and switches to 360. The front
      capture becomes `photoKey`, which is what invalidates any earlier read. */
  startThreeSixty: (angles: CapturedAngle[]) => void;
  setSelectedHairstyle: (id: string | null) => void;
  setStage: (stage: TryOnStage) => void;
  setAnalysis: (analysis: TryOnAnalysis) => void;
  setAnalysisError: (code: string | null) => void;
  reset: () => void;
}

export const useTryOnStore = create<TryOnStore>()(
  persist(
    (set, get) => ({
      photoKey: null,
      mode: 'single',
      angles: [],
      selectedHairstyleId: null,
      stage: 'idle',
      analysis: null,
      analysisError: null,

      // An analysis describes one photo. A different photo invalidates it, so
      // the next screen asks the AI again instead of showing the old read.
      // A new single photo also ends any 360 run that was in progress.
      setPhotoKey: (photoKey) =>
        set(
          photoKey === get().photoKey
            ? { photoKey }
            : {
                photoKey,
                mode: 'single',
                angles: [],
                analysis: null,
                analysisError: null,
                stage: 'idle',
              },
        ),

      startThreeSixty: (angles) =>
        set({
          mode: '360',
          angles,
          photoKey: angles.find((item) => item.angle === 'front')?.photoKey ?? angles[0]?.photoKey ?? null,
          analysis: null,
          analysisError: null,
          stage: 'idle',
        }),

      setSelectedHairstyle: (selectedHairstyleId) => set({ selectedHairstyleId }),
      setStage: (stage) => set({ stage }),
      setAnalysis: (analysis) => set({ analysis, analysisError: null }),
      setAnalysisError: (analysisError) => set({ analysisError }),
      reset: () =>
        set({
          photoKey: null,
          mode: 'single',
          angles: [],
          selectedHairstyleId: null,
          stage: 'idle',
          analysis: null,
          analysisError: null,
        }),
    }),
    {
      name: STORAGE_KEYS.tryOn,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        photoKey: state.photoKey,
        mode: state.mode,
        angles: state.angles,
        selectedHairstyleId: state.selectedHairstyleId,
        analysis: state.analysis,
      }),
    },
  ),
);
