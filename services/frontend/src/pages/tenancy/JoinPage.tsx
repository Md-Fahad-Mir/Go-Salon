import { AlertTriangle, CheckCircle2, UserX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Button, LinkButton } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Spinner';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import type { Tenant } from '../../types';

/* What a shop's QR code opens.

   The code says `{JOIN_URL_BASE}/join/{join_token}`, so this screen is
   reached cold: the phone's camera app resolves the URL and hands it to the
   browser. Nothing before it has run, and the person holding the phone may
   have no account at all — which is why the route is unguarded and the
   branching lives here. A guard could not do it: `PublicOnly` would bounce a
   signed-in customer away from the very thing they scanned, and `CustomerOnly`
   would throw an owner to their own dashboard with no explanation.

   Four ways this can go, and each gets its own answer rather than a shrug:

     still restoring   hold. The app has a token and has not yet asked whether
                       it is still good; showing the sign-in prompt now would
                       sign somebody out for a second and then change its mind.
     signed out        remember the code and send them to sign in. The store
                       keeps it, not the router, because the way into an
                       account for somebody standing in a salon is usually to
                       create one — and every hop of that journey drops router
                       state. See `setPendingRedirect`.
     not a customer    say so, and do not call. The backend would answer 403
                       `not_a_customer`, so the round trip could only tell us
                       what the role already does.
     a customer        join, and make this salon the active one.
*/
/** The frame every state of this screen shares. */
function JoinScreen({ children }: { children: ReactNode }) {
  return (
    <Screen>
      <Header close backTo={ROUTES.root} />
      <ScreenBody className="fullscreen-center">{children}</ScreenBody>
    </Screen>
  );
}

/** Park the code where it will survive the journey through auth, then go.

    Written during render rather than from an effect on purpose: the
    `<Navigate>` unmounts this component in the same commit, and an effect
    scheduled on a component that is about to go is not a reliable place to
    put something the next screen depends on. Writing the same string twice
    is a no-op in zustand, so a double render under StrictMode costs nothing. */
function PromptSignIn({ path }: { path: string }) {
  useAppStore.getState().setPendingRedirect(path);
  return <Navigate to={ROUTES.login} replace state={{ from: path }} />;
}

export default function JoinPage() {
  const t = useT();
  const location = useLocation();
  const { token = '' } = useParams<{ token: string }>();

  // One primitive per selector: zustand v5 has no shallow comparison, so an
  // object selector would re-render on every unrelated write to the store.
  const authStatus = useAppStore((s) => s.authStatus);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role) ?? 'customer';

  const [phase, setPhase] = useState<'joining' | 'joined' | 'failed'>('joining');
  const [joined, setJoined] = useState<Tenant | null>(null);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  /* The join is a write, and React runs effects twice under StrictMode in
     development. The ref holds the request itself rather than a "already asked"
     flag: a flag makes the second run skip, but the first run's cleanup has
     already disowned its own result, so the answer lands nowhere and the
     screen spins forever. Holding the promise lets the second run re-attach
     to the request the first one started — one POST, one answer. */
  const inFlight = useRef<Promise<Tenant> | null>(null);

  const mayJoin = isAuthenticated && role === 'customer' && token !== '';

  useEffect(() => {
    if (!mayJoin) return;
    // The store's action, not the service call: the scanner joins through the
    // same one, so what a token does after it is captured cannot differ
    // between a code the phone's camera opened and one scanned in the app.
    inFlight.current ??= useAppStore.getState().joinTenant(token);

    let live = true;
    void inFlight.current.then(
      (joined) => {
        if (!live) return;
        setJoined(joined);
        setPhase('joined');
      },
      (error: unknown) => {
        if (!live) return;
        setFailure(error instanceof ApiValidationError ? error : null);
        setPhase('failed');
      },
    );

    return () => {
      live = false;
    };
  }, [mayJoin, token]);

  // The app has a stored token and has not finished asking about it.
  if (authStatus === 'restoring') {
    return (
      <Screen>
        <ScreenBody className="fullscreen-center">
          <div className="fullscreen-center" aria-busy="true">
            <Spinner size="lg" label={t('state.loading')} />
          </div>
        </ScreenBody>
      </Screen>
    );
  }

  /* Signed out: keep the code somewhere that outlives the journey through
     auth, then hand over. `replace`, so the back button does not land them on
     a screen that would only bounce them here again. */
  if (!isAuthenticated) {
    return <PromptSignIn path={location.pathname} />;
  }

  if (role !== 'customer') {
    return (
      <JoinScreen>
        <EmptyState
          icon={<UserX size={26} aria-hidden="true" />}
          tone="warning"
          title={t('tenant.errNotCustomerTitle')}
          description={t('tenant.errNotCustomerBody')}
          action={<LinkButton to={ROUTES.root}>{t('action.backToHome')}</LinkButton>}
        />
      </JoinScreen>
    );
  }

  if (phase === 'joining') {
    return (
      <JoinScreen>
        <div className="fullscreen-center" aria-busy="true">
          <Spinner size="lg" label={t('tenant.joiningTitle')} />
          <p>{t('tenant.joiningBody')}</p>
        </div>
      </JoinScreen>
    );
  }

  if (phase === 'joined' && joined) {
    return (
      <JoinScreen>
        <EmptyState
          icon={<CheckCircle2 size={26} aria-hidden="true" />}
          tone="success"
          title={t('tenant.joinedTitle')}
          description={t('tenant.joinedBody', { name: joined.name })}
          /* To Home — which, since the join made this salon the active one,
             is this salon: its menu, its hours, and the button that books. It
             used to go straight into the booking wizard, when Home was a list
             the person would not have wanted; now the one screen that shows
             them what they just scanned is the right place to land, and
             booking is one tap further. `replace`, so Back does not return to
             the "you're in" card. */
          action={
            <LinkButton to={ROUTES.home} replace>
              {t('tenant.joinedAction')}
            </LinkButton>
          }
        />
      </JoinScreen>
    );
  }

  /* Failed. The token is the only thing this screen looks up, so a 404 is
     always "that code is dead" — the endpoint answers a retired token and one
     that never existed identically, on purpose, so nobody can test guesses
     against the live set. Everything else keeps the server's own sentence,
     which is more use than a generic apology. */
  const dead = failure?.status === 404;
  return (
    <JoinScreen>
      <EmptyState
        icon={<AlertTriangle size={26} aria-hidden="true" />}
        tone="danger"
        title={dead ? t('tenant.errInvalidTitle') : t('state.loadFailedTitle')}
        description={dead ? t('tenant.errInvalidBody') : (failure?.message ?? t('auth.errUnexpected'))}
        action={
          dead ? (
            /* `replace`, so the dead code is not left in the history. Back
               from Settings would otherwise remount this screen, and a remount
               forgets the request it made — so it would send the same dead
               token again and land here again. */
            <LinkButton to={ROUTES.profileSettings} replace>{t('tenant.backToSettings')}</LinkButton>
          ) : (
            <Button
              onClick={() => {
                inFlight.current = null;
                setPhase('joining');
              }}
            >
              {t('state.retry')}
            </Button>
          )
        }
      />
    </JoinScreen>
  );

}
