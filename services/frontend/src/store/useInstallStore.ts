import { create } from 'zustand';

/* The browser's install offer, caught and held until the app decides to use it.

   Chrome fires `beforeinstallprompt` once, early — often before React has
   mounted anything — and then shows its own mini-infobar whenever it likes.
   This project wants the offer on the join journey and nowhere else, so the
   event is caught at start-up (`listenForInstall`, called from `main.tsx`
   before the first render, because an effect in a component would run too
   late), its default is prevented, and it is kept here for `InstallBanner`.

   Nothing is persisted except "not now", and that only for the session. */

/** Chrome's event. TypeScript's DOM library does not describe it. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'gosalon.install.dismissed';

/** Whether "not now" was said in this browsing session. Storage can throw — a
    private window, blocked site data — and then the answer is simply no. */
export function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface InstallState {
  /** The held event, until it is used. One event is good for one prompt. */
  deferred: BeforeInstallPromptEvent | null;
  /** `appinstalled` has fired — by our button or from the browser's own menu. */
  installed: boolean;
  dismissed: boolean;
  dismiss: () => void;
  /** Shows the browser's real install dialog. */
  install: () => Promise<void>;
}

export const useInstallStore = create<InstallState>()((set, get) => ({
  deferred: null,
  installed: false,
  dismissed: dismissedThisSession(),

  dismiss: () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Unstorable: still hidden for as long as this page lives.
    }
    set({ dismissed: true });
  },

  install: async () => {
    const event = get().deferred;
    if (!event) return;
    // Spent whatever the answer: Chrome refuses a second `prompt()` on the
    // same event. Dropping it also hides the banner at once, rather than
    // leaving a button that can no longer do anything.
    set({ deferred: null });
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // Turned down in the browser's own dialog: the same as "not now", and
      // there is nothing left to offer this session anyway. An acceptance is
      // settled by `appinstalled`, which also covers installing from the menu.
      if (outcome === 'dismissed') get().dismiss();
    } catch {
      // The browser would not prompt after all. Nothing to show for it.
    }
  },
}));

/** Starts catching the offer. Returns the way to stop, for tests. */
export function listenForInstall(target: Window = window): () => void {
  const capture = (event: Event) => {
    event.preventDefault();
    useInstallStore.setState({ deferred: event as BeforeInstallPromptEvent });
  };
  const installed = () => useInstallStore.setState({ installed: true, deferred: null });
  target.addEventListener('beforeinstallprompt', capture);
  target.addEventListener('appinstalled', installed);
  return () => {
    target.removeEventListener('beforeinstallprompt', capture);
    target.removeEventListener('appinstalled', installed);
  };
}
