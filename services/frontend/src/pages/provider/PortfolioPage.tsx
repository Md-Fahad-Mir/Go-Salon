import { Camera, ImagePlus, Images, MessageSquare, Music2, Plus, RefreshCw, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Input, Textarea } from '../../components/common/Input';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { ListSkeleton } from '../../components/common/Skeleton';
import { Tabs } from '../../components/common/Tabs';
import { StarRow } from '../../components/booking/ReviewSummary';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { GalleryGrid } from '../../components/provider/business/GalleryGrid';
import { ReviewThread } from '../../components/provider/business/ReviewThread';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import { useProviderProfile } from '../../hooks/useRole';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { GalleryImage, Review } from '../../types';
import { MAX_GALLERY_IMAGES } from '../../constants';
import { messageOf } from '../../utils/errorMessage';
import { formatNumber, formatRating } from '../../utils/format';
import { reviewService } from '../../utils/reviewService';
import { cropSquare, readAsDataUrl } from '../../utils/image';
import { photoError } from '../../utils/validators';

type TabId = 'gallery' | 'reviews';

export default function PortfolioPage() {
  const t = useT();
  const profile = useProviderProfile();
  const updateProfile = useProviderStore((state) => state.updateProfile);
  const addGalleryImage = useProviderStore((state) => state.addGalleryImage);
  const removeGalleryImage = useProviderStore((state) => state.removeGalleryImage);
  const toast = useAppStore((state) => state.toast);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<TabId>('gallery');
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyError, setReplyError] = useState<string | undefined>(undefined);
  const [replying, setReplying] = useState(false);
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [instagram, setInstagram] = useState(profile?.socials?.instagram ?? '');
  const [facebook, setFacebook] = useState(profile?.socials?.facebook ?? '');
  const [tiktok, setTiktok] = useState(profile?.socials?.tiktok ?? '');

  /* `/api/reviews/` and never `/api/reviews/listing/…`: the scoped endpoint
     answers with what *this account* may read — the salon's for an owner,
     their own chair's for a stylist, their own work for a barber. The listing
     endpoint is public to anyone signed in, so pointing this screen at it
     would quietly hand a stylist every colleague's review. */
  const { reviews, summary, count, loading: reviewsLoading, failed: reviewsFailed, reload: reloadReviews } =
    useMyReviews();

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

  const openReply = (review: Review) => {
    setReplyDraft(review.reply ?? '');
    setReplyError(undefined);
    setReplyTo(review);
  };

  const postReply = async () => {
    if (!replyTo || replying) return;
    if (!replyDraft.trim()) {
      setReplyError(t('pb.replyEmpty'));
      return;
    }
    if (!replyTo.bookingId) return;
    setReplying(true);
    try {
      await reviewService.reply(replyTo.bookingId, replyDraft.trim());
      /* Re-read rather than patch in place: the server stamps who replied and
         when, and the customer sees that byline. Guessing it here is how the
         same sentence ended up signed with two different names. */
      reloadReviews();
      setReplyTo(null);
      toast('success', t('pb.replyPosted'));
    } catch (failure) {
      setReplyError(messageOf(failure));
    } finally {
      setReplying(false);
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
        <Tabs
          tabs={[
            { id: 'gallery', label: t('pb.tabGallery'), count: gallery.length },
            { id: 'reviews', label: t('pb.tabReviews'), count },
          ]}
          active={tab}
          onChange={setTab}
          label={t('pb.portfolioSections')}
        />

        {tab === 'gallery' ? (
          <>
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
          </>
        ) : reviewsFailed ? (
          <EmptyState
            icon={<MessageSquare size={26} aria-hidden="true" />}
            title={t('pb.reviewsFailedTitle')}
            description={reviewsFailed}
            action={
              <Button
                variant="outline"
                icon={<RefreshCw size={16} aria-hidden="true" />}
                onClick={reloadReviews}
              >
                {t('action.retry')}
              </Button>
            }
          />
        ) : reviewsLoading ? (
          <ListSkeleton rows={3} />
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={26} aria-hidden="true" />}
            title={t('pb.reviewsEmptyTitle')}
            description={t('pb.reviewsEmptyBody')}
          />
        ) : (
          <>
            {/* The score the server counted over every review this account
                may see — not the mean of the page on screen. */}
            <Card>
              <div className="pb-score">
                <span className="display">{formatRating(summary?.average ?? 0)}</span>
                <StarRow value={summary?.average ?? 0} />
                <span className="caption">
                  {t('biz.reviews', { count: formatNumber(count) })}
                </span>
              </div>
            </Card>

            <section className="section" aria-labelledby="pb-reviews">
              <h3 className="label" id="pb-reviews">{t('pb.reviewsHeading')}</h3>
              <div className="stack-sm">
                {reviews.map((review) => (
                  <ReviewThread
                    key={review.id}
                    review={review}
                    businessName={profile.businessName}
                    onReply={review.canReply ? () => openReply(review) : undefined}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </ScreenBody>

      {/* Reply */}
      <BottomSheet
        open={replyTo !== null}
        onClose={() => setReplyTo(null)}
        title={replyTo ? t('pb.replyTo', { name: replyTo.userName }) : t('pb.reply')}
        footer={
          <Button block loading={replying} onClick={() => void postReply()}>
            {t('pb.replyPost')}
          </Button>
        }
      >
        <div className="stack-sm">
          {replyTo ? <p className="review-text">{replyTo.text}</p> : null}
          <Textarea
            label={t('pb.replyLabel')}
            placeholder={t('pb.replyPlaceholder')}
            rows={4}
            value={replyDraft}
            error={replyError}
            onChange={(event) => {
              setReplyDraft(event.target.value);
              setReplyError(undefined);
            }}
          />
          {/* Worth saying out loud: this is published under the review, not
              a private note to the customer. */}
          <p className="field-hint">{t('pb.replyNote')}</p>
        </div>
      </BottomSheet>

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
