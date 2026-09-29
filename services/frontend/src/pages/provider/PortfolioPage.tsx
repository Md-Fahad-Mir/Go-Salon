import { Camera, ImagePlus, Images, Music2, Plus, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { GalleryGrid } from '../../components/provider/business/GalleryGrid';
import { useT } from '../../hooks/useLanguage';
import { useProviderProfile } from '../../hooks/useRole';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { GalleryImage } from '../../types';
import { MAX_GALLERY_IMAGES } from '../../constants';
import { messageOf } from '../../utils/errorMessage';
import { formatNumber } from '../../utils/format';
import { cropSquare, readAsDataUrl } from '../../utils/image';
import { photoError } from '../../utils/validators';

export default function PortfolioPage() {
  const t = useT();
  const profile = useProviderProfile();
  const updateProfile = useProviderStore((state) => state.updateProfile);
  const addGalleryImage = useProviderStore((state) => state.addGalleryImage);
  const removeGalleryImage = useProviderStore((state) => state.removeGalleryImage);
  const toast = useAppStore((state) => state.toast);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [instagram, setInstagram] = useState(profile?.socials?.instagram ?? '');
  const [facebook, setFacebook] = useState(profile?.socials?.facebook ?? '');
  const [tiktok, setTiktok] = useState(profile?.socials?.tiktok ?? '');

  if (!profile) {
    return (
      <Screen nav>
        <Header title={t('nav.portfolio')} />
        <ScreenBody className="pb-screen fullscreen-center">
          <EmptyState
            icon={<Images size={26} aria-hidden="true" />}
            title={t('pb.galleryEmptyTitle')}
            description={t('pb.galleryEmptyBody')}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const gallery = profile.gallery;
  const full = gallery.length >= MAX_GALLERY_IMAGES;

  /** The picture is cropped and read here, then stored as a data URL — the
      same path the customer's avatar takes. There is no upload endpoint. */
  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = photoError(file);
    if (problem) {
      toast('error', t('profile.photoBadTitle'), problem);
      return;
    }
    setUploading(true);
    try {
      const image = await readAsDataUrl(await cropSquare(file, 640));
      await addGalleryImage(image);
      toast('success', t('pb.photoAdded', { count: formatNumber(1) }));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (image: GalleryImage) => {
    try {
      await removeGalleryImage(image.id);
      toast('info', t('pb.photoDeleted'));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    }
  };

  const saveSocials = () => {
    void updateProfile({
      instagram: instagram.trim(),
      facebook: facebook.trim(),
      tiktok: tiktok.trim(),
    });
    setSocialsOpen(false);
    toast('success', t('pb.socialsSaved'));
  };

  return (
    <Screen nav>
      <Header title={t('nav.portfolio')} />
      <ScreenBody className="pb-screen pb-folio">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void pickPhoto(event)}
        />

        {gallery.length === 0 ? (
          <EmptyState
            icon={<Images size={26} aria-hidden="true" />}
            title={t('pb.galleryEmptyTitle')}
            description={t('pb.galleryEmptyBody')}
            action={
              <Button
                icon={<Plus size={18} aria-hidden="true" />}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {t('pb.addPhotos')}
              </Button>
            }
          />
        ) : (
          <>
            <GalleryGrid images={gallery} onDelete={(image) => void deletePhoto(image)} />
            <Button
              variant="outline"
              block
              icon={<ImagePlus size={18} aria-hidden="true" />}
              loading={uploading}
              disabled={full}
              onClick={() => fileRef.current?.click()}
            >
              {t('pb.addPhotos')}
            </Button>
          </>
        )}

        <p className="caption dim">
          {full
            ? t('pb.galleryFull', { count: formatNumber(MAX_GALLERY_IMAGES) })
            : t('pb.galleryRoom', {
                count: formatNumber(MAX_GALLERY_IMAGES - gallery.length),
              })}
        </p>

        <section className="section" aria-labelledby="pb-socials">
          <h3 className="label" id="pb-socials">{t('pb.socials')}</h3>
          <ListCard>
            <ListRow
              icon={<Camera size={18} aria-hidden="true" />}
              title={t('pb.instagram')}
              sub={profile.socials?.instagram ?? t('pb.socialNotSet')}
              onClick={() => setSocialsOpen(true)}
            />
            <ListRow
              icon={<Users size={18} aria-hidden="true" />}
              title={t('pb.facebook')}
              sub={profile.socials?.facebook ?? t('pb.socialNotSet')}
              onClick={() => setSocialsOpen(true)}
            />
            <ListRow
              icon={<Music2 size={18} aria-hidden="true" />}
              title={t('pb.tiktok')}
              sub={profile.socials?.tiktok ?? t('pb.socialNotSet')}
              onClick={() => setSocialsOpen(true)}
            />
          </ListCard>
        </section>
      </ScreenBody>

      {/* Social handles */}
      <BottomSheet
        open={socialsOpen}
        onClose={() => setSocialsOpen(false)}
        title={t('pb.socialsEdit')}
        description={t('pb.socialsHint')}
        footer={<Button block onClick={saveSocials}>{t('action.save')}</Button>}
      >
        <div className="stack-sm">
          <Input
            label={t('pb.instagram')}
            placeholder={t('pb.handlePlaceholder')}
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
          />
          <Input
            label={t('pb.facebook')}
            placeholder={t('pb.handlePlaceholder')}
            value={facebook}
            onChange={(event) => setFacebook(event.target.value)}
          />
          <Input
            label={t('pb.tiktok')}
            placeholder={t('pb.handlePlaceholder')}
            value={tiktok}
            onChange={(event) => setTiktok(event.target.value)}
          />
        </div>
      </BottomSheet>
    </Screen>
  );
}
