import { AlertCircle, Scissors, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RichText } from '../components/auth/RichText';
import { areaLabel } from '../components/auth/areas';
import { Button } from '../components/common/Button';
import { Callout } from '../components/common/Callout';
import { Chip, ChipRow } from '../components/common/Chip';
import { EmptyState } from '../components/common/EmptyState';
import { HairstyleCard } from '../components/common/HairstyleCard';
import { IconButton } from '../components/common/IconButton';
import { ProfessionalCard } from '../components/common/ProfessionalCard';
import { CardSkeleton } from '../components/common/Skeleton';
import { Segmented } from '../components/common/Tabs';
import { OCCASION_KEYS } from '../components/home/labels';
import { SearchBar } from '../components/search/SearchBar';
import { Header } from '../components/layout/Header';
import { Screen, ScreenBody } from '../components/layout/Screen';
import { DEFAULT_LOCATION, OCCASIONS } from '../constants';
import { useDebounce } from '../hooks/useDebounce';
import { useT } from '../hooks/useLanguage';
import type { TKey } from '../i18n';
import { getHairstyle, mockHairstyles } from '../mockData';
import { messageOf } from '../utils/errorMessage';
import { useAppStore } from '../store/useAppStore';
import type { Occasion, Audience } from '../types';
import { audienceFor } from '../utils/audience';
import { api, type NearbyProfessional } from '../utils/api';
import { formatNumber } from '../utils/format';

type Tab = 'pros' | 'styles';

const TABS: Array<{ id: Tab; labelKey: TKey }> = [
  { id: 'pros', labelKey: 'home.tabPros' },
  { id: 'styles', labelKey: 'home.tabStyles' },
];

/** The one question this row asks. Who the results are for is the only filter
    a customer reliably knows the answer to before they have seen anything;
    salon-or-barber, open-now and an order to sort by were three more decisions
    asked before the first result had been read. Results stay nearest-first,
    which is the order somebody standing in Banani actually wants.

    `all` is how a customer browses the other side — buying for a partner, or
    simply curious. */
const AUDIENCES: Array<{ id: Audience | 'all'; labelKey: TKey }> = [
  { id: 'all', labelKey: 'home.audienceAll' },
  { id: 'men', labelKey: 'home.audienceMen' },
  { id: 'women', labelKey: 'home.audienceWomen' },
];

interface ProResult {
  key: string;
  list?: NearbyProfessional[];
  failed?: boolean;
  /** The server's own words, so a network problem does not read the same as
      an empty city. */
  detail?: string;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const t = useT();
  const user = useAppStore((s) => s.user);
  const point = user?.location ?? DEFAULT_LOCATION;
  const area = areaLabel(t, user?.location?.area ?? DEFAULT_LOCATION.area);

  const q = params.get('q') ?? '';
  const tab: Tab = params.get('tab') === 'styles' ? 'styles' : 'pros';
  const hairstyleId = params.get('hairstyle') ?? undefined;
  const hairstyle = hairstyleId ? getHairstyle(hairstyleId) : undefined;

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  /* The input owns its text; the URL follows after a short pause. */
  const [text, setText] = useState(q);
  const debounced = useDebounce(text.trim(), 250);
  useEffect(() => {
    if (debounced === q) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [debounced, q, params, setParams]);

  /* Professionals tab filters (local, not in the URL). */
  const [attempt, setAttempt] = useState(0);
  const [proResult, setProResult] = useState<ProResult | null>(null);
  /* In the URL, not in component state: pressing Back onto this screen has to
     bring the same results with it, and a `useState` filter would quietly
     reset while the restored scroll position stayed — an offset into a list
     that is no longer the one it was measured against.

     `?audience=` also lets the home screen's "Change" link open search already
     showing everything. With nothing asked for, it starts on the customer's
     own side of the catalogue. */
  const asked = params.get('audience');
  const audience: Audience | 'all' =
    asked === 'all' || asked === 'men' || asked === 'women'
      ? asked
      : (audienceFor(user?.gender) ?? 'all');
  const setAudience = (value: Audience | 'all') => setParam('audience', value);

  const { lat, lng } = point;
  const proKey = [lat.toFixed(4), lng.toFixed(4), q, audience, attempt].join('|');

  /* Every filter is applied by the server, so this is one request per change
     of the key above rather than a catalogue pulled down and sieved here. */
  useEffect(() => {
    let active = true;
    api.professionals
      .search({ lat, lng }, { query: q, audience, sort: 'distance' })
      .then((list) => {
        if (active) setProResult({ key: proKey, list });
      })
      .catch((error: unknown) => {
        if (active) setProResult({ key: proKey, failed: true, detail: messageOf(error) });
      });
    return () => {
      active = false;
    };
  }, [proKey, lat, lng, q, audience]);

  const proReady = proResult?.key === proKey;
  const pros = proReady ? (proResult.list ?? []) : [];
  const proFailed = proReady ? proResult.failed : undefined;
  const proFailure = proReady ? proResult.detail : undefined;
  const proLoading = !proReady;

  /* Hairstyles tab: client-side, and in the URL for the same reason. */
  const occasion = (params.get('occasion') ?? 'all') as Occasion | 'all';
  const setOccasion = (value: Occasion | 'all') =>
    setParam('occasion', value === 'all' ? undefined : value);
  const styles = useMemo(() => {
    const needle = q.toLowerCase();
    return mockHairstyles.filter((style) => {
      if (occasion !== 'all' && !style.occasions.includes(occasion)) return false;
      if (!needle) return true;
      return `${style.name} ${style.category} ${style.tags.join(' ')}`.toLowerCase().includes(needle);
    });
  }, [q, occasion]);

  const hasProFilters = Boolean(q) || Boolean(hairstyleId);

  const clearProFilters = () => {
    setText('');
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('hairstyle');
    setParams(next, { replace: true });
  };

  const clearStyleFilters = () => {
    setText('');
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('occasion');
    setParams(next, { replace: true });
  };

  return (
    <Screen nav>
      <Header title={t('nav.search')} />
      <ScreenBody>
        <div className="stack-sm search-top">
          <SearchBar
            value={text}
            onChange={setText}
            placeholder={t('home.searchPlaceholder')}
            label={t('home.searchLabel')}
          />
          <Segmented
            tabs={TABS.map((option) => ({ id: option.id, label: t(option.labelKey) }))}
            active={tab}
            onChange={(id) => setParam('tab', id === 'styles' ? 'styles' : undefined)}
            label={t('home.tabsLabel')}
          />
        </div>

        {tab === 'pros' ? (
          <>
            {hairstyle ? (
              <Callout tone="accent" icon={<Scissors size={18} aria-hidden="true" />} className="search-callout">
                <span className="search-callout-inner">
                  <span>
                    <RichText
                      template={t('home.bookingForStyle')}
                      nodes={{ style: <strong>{hairstyle.name}</strong> }}
                    />
                  </span>
                  <IconButton label={t('home.showAllPros')} onClick={() => setParam('hairstyle')}>
                    <X size={18} />
                  </IconButton>
                </span>
              </Callout>
            ) : null}

            <ChipRow scroll label={t('home.filtersLabel')} className="search-filters">
              {AUDIENCES.map((option) => (
                <Chip
                  key={option.id}
                  active={audience === option.id}
                  onClick={() => setAudience(option.id)}
                >
                  {t(option.labelKey)}
                </Chip>
              ))}
            </ChipRow>

            <div className="search-results stack stagger" aria-live="polite" aria-busy={proLoading || undefined}>
              {proLoading ? (
                <>
                  <p className="search-count caption">{t('home.findingNear', { area })}</p>
                  <CardSkeleton count={2} />
                </>
              ) : proFailed ? (
                <Callout
                  tone="danger"
                  icon={<AlertCircle size={18} aria-hidden="true" />}
                  title={t('home.loadPlacesFailedTitle')}
                >
                  {proFailure ?? t('home.loadPlacesFailed')}
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                      {t('action.retry')}
                    </Button>
                  </div>
                </Callout>
              ) : pros.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={26} />}
                  title={t('home.noMatches')}
                  description={hasProFilters ? t('home.noMatchesFiltered') : t('home.noMatchesNearby')}
                  action={
                    hasProFilters ? (
                      <Button variant="secondary" onClick={clearProFilters}>
                        {t('action.clearFilters')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <p className="search-count caption">
                    {t('home.placesNear', { count: formatNumber(pros.length), area })}
                  </p>
                  {pros.map((pro) => (
                    <ProfessionalCard key={pro.id} pro={pro} variant="list" hairstyleId={hairstyleId} />
                  ))}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <ChipRow scroll label={t('home.occasionLabel')} className="search-filters">
              <Chip active={occasion === 'all'} onClick={() => setOccasion('all')}>
                {t('home.occasionAll')}
              </Chip>
              {OCCASIONS.map((option) => (
                <Chip key={option.id} active={occasion === option.id} onClick={() => setOccasion(option.id)}>
                  {t(OCCASION_KEYS[option.id])}
                </Chip>
              ))}
            </ChipRow>

            <div className="search-results stack" aria-live="polite">
              {styles.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={26} />}
                  title={t('home.noMatches')}
                  description={t('home.noStyleMatches')}
                  action={
                    <Button variant="secondary" onClick={clearStyleFilters}>
                      {t('action.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <>
                  <p className="search-count caption">
                    {occasion === 'all'
                      ? t('home.stylesCount', { count: formatNumber(styles.length) })
                      : t('home.stylesForOccasion', {
                          count: formatNumber(styles.length),
                          occasion: t(OCCASION_KEYS[occasion]).toLowerCase(),
                        })}
                  </p>
                  <div className="grid-2 stagger search-styles">
                    {styles.map((style) => (
                      <HairstyleCard key={style.id} style={style} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
