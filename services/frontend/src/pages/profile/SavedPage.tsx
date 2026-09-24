import { Heart } from 'lucide-react';
import { ROUTES } from '../../constants';
import { LinkButton } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { ProfessionalCard } from '../../components/common/ProfessionalCard';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import { getProfessional } from '../../store/useDirectoryStore';
import { useAppStore } from '../../store/useAppStore';
import { formatNumber } from '../../utils/format';
import { distanceKm } from '../../utils/geo';

export default function SavedPage() {
  const favorites = useAppStore((s) => s.favorites);
  const user = useAppStore((s) => s.user);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const toast = useAppStore((s) => s.toast);
  const t = useT();

  const pros = favorites
    .map((id) => getProfessional(id))
    .filter((pro) => pro !== undefined)
    .map((pro) => ({ ...pro, distanceKm: user?.location ? distanceKm(user.location, pro.location) : undefined }));

  const unsave = (id: string, name: string) => {
    toggleFavorite(id);
    toast('info', t('profile.removedFromSaved'), name);
  };

  return (
    <Screen nav>
      <Header title={t('profile.savedTitle')} back backTo={ROUTES.profile} />
      <ScreenBody className="pf-screen">
        {pros.length === 0 ? (
          <EmptyState
            className="pf-empty"
            icon={<Heart size={26} aria-hidden="true" />}
            title={t('profile.nothingSavedTitle')}
            description={t('profile.nothingSavedBody')}
            action={<LinkButton to={ROUTES.home}>{t('profile.explore')}</LinkButton>}
          />
        ) : (
          <>
            <p className="caption pf-count">{t('profile.savedCount', { count: formatNumber(pros.length) })}</p>
            <ul className="stack stagger pf-saved-list" aria-label={t('profile.savedPros')}>
              {pros.map((pro) => (
                <li key={pro.id} className="pf-saved">
                  <ProfessionalCard pro={pro} variant="list" />
                  <IconButton
                    label={t('profile.removeFromSaved', { name: pro.name })}
                    variant="scrim"
                    active
                    className="pf-saved-heart"
                    onClick={() => unsave(pro.id, pro.name)}
                  >
                    <Heart size={20} fill="currentColor" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
}
