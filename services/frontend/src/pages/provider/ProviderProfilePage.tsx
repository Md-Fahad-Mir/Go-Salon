import { BarChart3, Building2, CalendarRange, Camera, Clock, Images, Lock, MapPin, Pencil, Scissors, UserRound, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChangeEvent } from 'react';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button, LinkButton } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Input, Textarea } from '../../components/common/Input';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { PhoneInput } from '../../components/common/PhoneInput';
import { Price } from '../../components/common/Price';
import { Rating } from '../../components/common/Rating';
import { Spinner } from '../../components/common/Spinner';
import { Toggle } from '../../components/common/Toggle';
import { GalleryGrid } from '../../components/provider/business/GalleryGrid';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { WeekHoursList } from '../../components/provider/hours/WeekHoursList';
import { WeekHoursSheet } from '../../components/provider/hours/WeekHoursSheet';
import { ROLE_KEYS, VERIFICATION } from '../../components/provider/business/labels';
import { ROUTES } from '../../constants';
import { useT } from '../../hooks/useLanguage';
import { useMyReviews } from '../../hooks/useReviews';
import type { TranslationKey } from '../../i18n';
import { useProviderProfile, useRole } from '../../hooks/useRole';
import { useAppStore } from '../../store/useAppStore';
import { useProviderStore } from '../../store/useProviderStore';
import type { WeekSchedule } from '../../types';
import { messageOf } from '../../utils/errorMessage';
import { formatDuration, formatNumber, formatPhone } from '../../utils/format';
import { cropSquare, readAsDataUrl } from '../../utils/image';
import { isValidPhone, localDigits, photoError, toE164 } from '../../utils/validators';

/** The provider's own account: who the business is, how it takes bookings,
    when it opens, and the same language and appearance controls the customer
    app has. An employee sees the read-only version — their salon owns the
    rates, the hours and the shopfront. */
interface WorkLink {
  to: string;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: LucideIcon;
}

/** The day-to-day screens that are not portfolio.
 *
 *  They live here rather than in Settings, which is the app's own business —
 *  language, theme, signing out — and not the professional's. Each of these
 *  belongs to the person whose profile this is, so this is where they are
 *  reached from now that the bottom bar carries five things.
 */
const WORK_LINKS: Record<string, WorkLink[]> = {
  barber: [
    { to: ROUTES.proCalendar, labelKey: 'nav.calendar', hintKey: 'pb.diaryRowHint', icon: CalendarRange },
    { to: ROUTES.proPortfolio, labelKey: 'nav.portfolio', hintKey: 'pb.galleryHint', icon: Images },
  ],
  womens_stylist: [
    { to: ROUTES.proClients, labelKey: 'nav.clients', hintKey: 'pb.clientsRowHint', icon: Users },
    { to: ROUTES.proLookbook, labelKey: 'nav.lookbook', hintKey: 'pb.lookbookRowHint', icon: Images },
  ],
  salon_employee: [
    { to: ROUTES.proCalendar, labelKey: 'nav.calendar', hintKey: 'pb.diaryRowHint', icon: CalendarRange },
    { to: ROUTES.proPerformance, labelKey: 'nav.performance', hintKey: 'pb.performanceRowHint', icon: BarChart3 },
  ],
};

/** Who decides a section its reader cannot change.
 *
 *  An employee's hours, the work they are cleared for and the chair they sit
 *  in are their salon's to set. Three sections, one repeated mark: a reader
 *  learns the rule once instead of meeting a differently-worded explanation
 *  in each place, and no section is left silently uneditable. */
function SetBySalon() {
  const t = useT();
  return (
    <span className="pb-locked">
      <Lock size={11} aria-hidden="true" />
      {t('pb.setBySalon')}
    </span>
  );
}

export default function ProviderProfilePage() {
  const t = useT();
  const { isEmployee, servesWomen } = useRole();
  const navigate = useNavigate();
  const profile = useProviderProfile();
  /* Whatever this account's reviews are: the salon's for an owner, this
     chair's for an employee, this barber's own work for a barber. The server
     decides which, so the screen does not have to branch on role. */
  const { summary: reviews } = useMyReviews();
  const user = useAppStore((state) => state.user);
  const updateProfile = useProviderStore((state) => state.updateProfile);
  const setAutoAccept = useProviderStore((state) => state.setAutoAccept);
  const schedule = useProviderStore((state) => state.schedule);
  const services = useProviderStore((state) => state.services);

  /* What this person can be booked for.
     A barber's price list is their own, so all of it is theirs. An employee
     reads their salon's menu — the endpoint gives them the whole thing, since
     they need to know what they may be asked to do — and what is *theirs* is
     the part they have been cleared for. A service naming nobody is open to
     every active chair, which is the same answer stated positively. */
  const chair = profile?.staffId;
  const mine = useMemo(
    () =>
      services.filter(
        (service) =>
          service.active &&
          (!isEmployee || service.availableToAll || (chair ? service.staffIds.includes(chair) : false)),
      ),
    [services, isEmployee, chair],
  );

  const workLinks = useMemo(
    () => WORK_LINKS[isEmployee ? 'salon_employee' : servesWomen ? 'womens_stylist' : 'barber'],
    [isEmployee, servesWomen],
  );
  const saveSchedule = useProviderStore((state) => state.saveSchedule);
  const status = useProviderStore((state) => state.status);
  const load = useProviderStore((state) => state.load);
  const error = useProviderStore((state) => state.error);
  const toast = useAppStore((state) => state.toast);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  /** The person's own name. An employee has no trading name to edit, so this
      is what their form puts at the top instead. */
  const [name, setName] = useState(user?.name ?? '');
  const [businessName, setBusinessName] = useState(profile?.businessName ?? '');
  const [tagline, setTagline] = useState(profile?.tagline ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [phone, setPhone] = useState(localDigits(profile?.phone ?? ''));
  const [avatar, setAvatar] = useState(profile?.avatar ?? '');
  const [specialties, setSpecialties] = useState((profile?.specialties ?? []).join(', '));
  const [years, setYears] = useState(String(profile?.experienceYears ?? 0));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* Three states that are not "here is your business": still fetching, the
     fetch failed, and there is genuinely nothing yet. All three keep the one
     control that has nothing to do with the business — signing out. */
  if (!profile) {
    return (
      <Screen nav>
        <Header title={t(isEmployee ? 'pb.profileTitleEmployee' : 'pb.profileTitle')} />
        <ScreenBody className="pb-screen fullscreen-center">
          {status === 'loading' ? (
            <Spinner size="lg" label={t('state.loading')} />
          ) : status === 'error' ? (
            <EmptyState
              icon={<UserRound size={26} aria-hidden="true" />}
              title={t('state.loadFailedTitle')}
              description={error ?? undefined}
              action={<Button onClick={() => void load()}>{t('state.retry')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<UserRound size={26} aria-hidden="true" />}
              title={t('pb.noProfileTitle')}
              description={t('pb.noProfileBody')}
            />
          )}
          {user ? <p className="caption dim">{t('pb.signedInAs', { name: user.name })}</p> : null}
          <LinkButton variant="ghost" to={ROUTES.proSettings}>{t('nav.settings')}</LinkButton>
        </ScreenBody>
      </Screen>
    );
  }

  const verification = VERIFICATION[profile.verification];
  const salonName = profile.salonName ?? profile.businessName;

  const businessNameError = businessName.trim() ? undefined : t('pb.errBusinessName');
  const personNameError = name.trim() ? undefined : t('pb.errYourName');
  const phoneError = isValidPhone(phone) ? undefined : t('pb.errPhone');
  /* An employee fills in a person and a barber fills in a business, so the
     one required name is a different field for each. The number is the same
     question either way. */
  const formInvalid =
    Boolean(phoneError) || Boolean(isEmployee ? personNameError : businessNameError);

  const openDetails = () => {
    setName(user?.name ?? profile.businessName);
    setBusinessName(profile.businessName);
    setTagline(profile.title);
    setBio(profile.bio);
    setPhone(localDigits(profile.phone));
    setAvatar(profile.avatar);
    setSpecialties(profile.specialties.join(', '));
    setYears(String(profile.experienceYears));
    setSubmitted(false);
    setDetailsOpen(true);
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = photoError(file);
    if (problem) {
      toast('error', t('profile.photoBadTitle'), problem);
      return;
    }
    setPhotoBusy(true);
    try {
      setAvatar(await readAsDataUrl(await cropSquare(file, 320)));
    } catch {
      toast('error', t('profile.photoReadFail'), t('profile.photoTryAnother'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveDetails = async () => {
    setSubmitted(true);
    if (formInvalid) return;
    setSaving(true);
    try {
      /* The trading name is a business's, and an employee has none — the
         server strips it from their PATCH, so sending one would be a lie
         about what this form does. What they are called is `name`, on the
         account, and that is theirs. */
      await updateProfile({
        title: tagline.trim(),
        bio: bio.trim(),
        avatar,
        contact_phone: toE164(phone),
        specialties: specialties
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        experience_years: Math.max(0, Math.round(Number(years) || 0)),
        ...(isEmployee ? { name: name.trim() } : { business_name: businessName.trim() }),
      });
      setDetailsOpen(false);
      toast('success', t('pb.detailsSaved'));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSaving(false);
    }
  };

  const saveHours = async (week: WeekSchedule) => {
    setSavingHours(true);
    try {
      await saveSchedule(week);
      setHoursOpen(false);
      toast('success', t('hours.saved'));
    } catch (failure) {
      toast('error', t('state.saveFailed'), messageOf(failure));
    } finally {
      setSavingHours(false);
    }
  };

  return (
    <Screen nav>
      <Header title={t(isEmployee ? 'pb.profileTitleEmployee' : 'pb.profileTitle')} />
      <ScreenBody className="pb-screen pb-hub">
        <Card className="pb-profile-head">
          <Avatar name={profile.businessName} src={profile.avatar || undefined} size="xl" ring />
          <div className="grow">
            <h2 className="pb-profile-name">{profile.businessName}</h2>
            {/* An employee's line is the job they were hired to do — it is the
                one thing about them a client reads first. A business's is what
                kind of business it is. */}
            <p className="caption">
              {isEmployee && profile.title ? profile.title : t(ROLE_KEYS[profile.role])}
            </p>
            <div className="row-sm pb-profile-badges">
              {reviews && reviews.count > 0 && reviews.average !== null ? (
                <Rating value={reviews.average} count={reviews.count} />
              ) : null}
              {/* Verification is a statement about a *business* — its licence,
                  its standing. For an employee it is their salon's, and a
                  stylist reading "verification pending" under her own name is
                  being told something about somebody else. */}
              {isEmployee ? (
                salonName ? (
                  <Badge tone="neutral">{t('pb.atSalon', { salon: salonName })}</Badge>
                ) : null
              ) : (
                <Badge tone={verification.tone}>{t(verification.key)}</Badge>
              )}
            </div>
          </div>
        </Card>

        {isEmployee ? (
          <Button
            variant="outline"
            block
            icon={<Pencil size={18} aria-hidden="true" />}
            onClick={openDetails}
          >
            {t('pb.editYourProfile')}
          </Button>
        ) : null}

        <p className="caption dim">{t('pb.signedInAs', { name: user?.name ?? profile.businessName })}</p>

        {isEmployee ? (
          <>
            {/* The half of the record that *is* theirs, and the half they are
                most likely to have come here to change — so it leads. */}
            {/* No Edit of its own: the button above this opens the same form,
                and everything in this card is in it. */}
            <section className="section" aria-labelledby="pb-about-you">
              <h3 className="label" id="pb-about-you">{t('pb.aboutYou')}</h3>
              <Card className="stack-sm">
                <p className="caption">{profile.bio || t('pb.aboutYouEmpty')}</p>
                {profile.specialties.length ? (
                  <div className="row-sm" style={{ flexWrap: 'wrap' }}>
                    {profile.specialties.map((item) => (
                      <Badge key={item} tone="accent">{item}</Badge>
                    ))}
                  </div>
                ) : null}
                <p className="caption dim">
                  {t('pb.experienceYears', { count: formatNumber(profile.experienceYears) })}
                </p>
              </Card>
            </section>

            <section className="section" aria-labelledby="pb-works-at">
              <div className="section-head">
                <h3 id="pb-works-at">{t('pb.worksAt')}</h3>
                <SetBySalon />
              </div>
              <ListCard>
                <ListRow
                  icon={<Building2 size={18} aria-hidden="true" />}
                  title={salonName}
                  sub={t('pb.yourEmployer')}
                  chevron={false}
                />
                {profile.location.area || profile.location.address ? (
                  <ListRow
                    icon={<MapPin size={18} aria-hidden="true" />}
                    title={profile.location.area || profile.location.address}
                    sub={profile.location.area ? profile.location.address || undefined : undefined}
                    chevron={false}
                  />
                ) : null}
              </ListCard>
            </section>
          </>
        ) : (
          <section className="section" aria-labelledby="pb-details">
            <div className="section-head">
              <h3 id="pb-details">{t('pb.businessDetails')}</h3>
              <Button
                variant="ghost"
                size="xs"
                icon={<Pencil size={14} aria-hidden="true" />}
                onClick={openDetails}
              >
                {t('action.edit')}
              </Button>
            </div>
            <Card className="stack-sm">
              <p className="pb-tagline">{profile.title}</p>
              <p className="caption">{profile.bio}</p>
              <p className="caption dim">{formatPhone(profile.phone)}</p>
            </Card>
          </section>
        )}

        {!isEmployee ? (
          <section className="section" aria-labelledby="pb-bookings">
            <h3 className="label" id="pb-bookings">{t('pb.bookingPrefs')}</h3>
            {/* Both of these decide whether work comes in and on what terms,
                which is why they sit together. Taking new clients was filed
                under "privacy and safety" and was never either of those. */}
            <Card className="stack-sm">
              <Toggle
                checked={profile.autoAccept}
                onChange={(on) => void setAutoAccept(on)}
                label={t('pro.autoAccept')}
                hint={t('pro.autoAcceptHint')}
              />
              <Toggle
                checked={profile.acceptingClients}
                onChange={(on) => void updateProfile({ accepting_clients: on })}
                label={t('pb.acceptingClients')}
                hint={t('pb.acceptingClientsHint')}
              />
            </Card>
          </section>
        ) : null}

        {/* An employee works the salon's hours. There is no personal override
            to set or hand back any more: the shop decides when it is open, and
            a chair inside it cannot be open at another time. So this reads,
            and says whose week it is rather than offering to change it. */}
        <section className="section" aria-labelledby="pb-hours">
          <div className="section-head">
            <h3 id="pb-hours">{t('hours.title')}</h3>
            {isEmployee ? (
              <SetBySalon />
            ) : (
              <Button
                variant="ghost"
                size="xs"
                icon={<Clock size={14} aria-hidden="true" />}
                onClick={() => setHoursOpen(true)}
              >
                {t('action.edit')}
              </Button>
            )}
          </div>
          {isEmployee ? (
            <p className="caption">{t('hours.fromSalonBody', { salon: salonName })}</p>
          ) : null}
          {/* Nothing has ever been saved, so what is listed below is a
              suggestion the server offered to start from — and customers are
              being told this business is closed every day. Saying so is the
              difference between an empty calendar and an unexplained one. */}
          {!isEmployee && schedule?.source === 'default' ? (
            <Callout tone="warning" title={t('hours.unsavedTitle')}>
              {t('hours.unsavedBody')}
            </Callout>
          ) : null}
          <Card>
            {schedule ? <WeekHoursList week={schedule.days} /> : <Spinner label={t('state.loading')} />}
          </Card>
        </section>


        {!isEmployee ? (
          <section className="section" aria-labelledby="pb-money">
            <h3 className="label" id="pb-money">{t('pb.moneySection')}</h3>
            <ListCard>
              <ListRow
                icon={<Wallet size={18} aria-hidden="true" />}
                title={t('nav.earnings')}
                sub={t('pb.earningsRowHint')}
                to={ROUTES.proEarnings}
              />
            </ListCard>
          </section>
        ) : null}

        {/* --- What you do --------------------------------------------------
            A barber's own price list. An employee's is the salon's menu
            narrowed to the work they have been cleared for — a service that
            names nobody is open to every active chair, which is why
            `availableToAll` counts as cleared. It is read-only for them: the
            salon prices its own work. */}
        <section className="section" aria-labelledby="pb-menu">
          <div className="section-head">
            <h3 id="pb-menu">{t('pb.menuSection')}</h3>
            {isEmployee ? (
              <SetBySalon />
            ) : (
              <Button
                variant="ghost"
                size="xs"
                icon={<Scissors size={14} aria-hidden="true" />}
                onClick={() => navigate(servesWomen ? ROUTES.proTreatments : ROUTES.proServices)}
              >
                {t('pb.menuManage')}
              </Button>
            )}
          </div>
          <p className="caption">{t(isEmployee ? 'pb.menuHintEmployee' : 'pb.menuHint')}</p>
          {mine.length ? (
            <ListCard className="pb-menu-rail">
              {mine.map((service) => (
                <ListRow
                  key={service.id}
                  title={service.name}
                  sub={formatDuration(service.duration)}
                  end={<Price value={service.price} />}
                  chevron={false}
                />
              ))}
            </ListCard>
          ) : (
            <p className="muted">{t(isEmployee ? 'pb.menuEmptyEmployee' : 'pb.menuEmpty')}</p>
          )}
        </section>

        {/* --- Your work ---------------------------------------------------- */}
        <section className="section" aria-labelledby="pb-gallery">
          <div className="section-head">
            <h3 id="pb-gallery">{t('pb.gallerySection')}</h3>
            <Button
              variant="ghost"
              size="xs"
              icon={<Images size={14} aria-hidden="true" />}
              onClick={() => navigate(ROUTES.proPortfolio)}
            >
              {t('pb.galleryManage')}
            </Button>
          </div>
          <p className="caption">{t('pb.galleryHint')}</p>
          {/* The empty-state line is a nudge for somebody building a shopfront
              of their own. An employee already has the hint above it and the
              Manage button beside it, so a third line saying the same thing is
              just noise on their screen. */}
          <GalleryGrid
            images={profile.gallery}
            empty={isEmployee ? undefined : <p className="muted">{t('pb.galleryEmptyBody')}</p>}
          />
        </section>

        {/* The day-to-day screens that are not portfolio, hung off the person
            they belong to rather than off Settings, which is the app's own. */}
        <section className="section" aria-labelledby="pb-work">
          <h3 className="label" id="pb-work">{t('pr.manageSection')}</h3>
          <ListCard>
            {workLinks.map((link) => (
              <ListRow
                key={link.to}
                icon={<link.icon size={18} aria-hidden="true" />}
                title={t(link.labelKey)}
                sub={t(link.hintKey)}
                to={link.to}
              />
            ))}
          </ListCard>
        </section>
      </ScreenBody>

      <BottomSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={isEmployee ? t('pb.editYourProfile') : t('pb.editBusiness')}
        footer={
          <Button block loading={saving} onClick={() => void saveDetails()}>
            {t('action.save')}
          </Button>
        }
      >
        <div className="stack">
          <div className="pf-avatar-picker">
            <Avatar
              name={isEmployee ? name || profile.businessName : businessName || profile.businessName}
              src={avatar || undefined}
              size="2xl"
              ring
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void pickPhoto(event)}
            />
            <div className="row">
              <Button
                size="sm"
                variant="outline"
                icon={<Camera size={16} aria-hidden="true" />}
                loading={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {avatar ? t('profile.changePhoto') : t('profile.addPhoto')}
              </Button>
              {avatar ? (
                <Button size="sm" variant="ghost" onClick={() => setAvatar('')}>
                  {t('profile.remove')}
                </Button>
              ) : null}
            </div>
          </div>

          {isEmployee ? (
            <Input
              label={t('pb.yourName')}
              hint={t('pb.yourNameHint')}
              value={name}
              error={submitted ? personNameError : undefined}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              maxLength={60}
            />
          ) : (
            <Input
              label={t('pb.businessName')}
              value={businessName}
              error={submitted ? businessNameError : undefined}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          )}
          <Input
            label={t('pb.yourTitle')}
            hint={t(isEmployee ? 'pb.yourTitleHint' : 'pb.taglineHint')}
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
          />
          <Textarea
            label={t('pb.bio')}
            hint={t('pb.bioHint')}
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
          <Input
            label={t('pb.specialties')}
            hint={t('pb.specialtiesHint')}
            value={specialties}
            onChange={(event) => setSpecialties(event.target.value)}
            autoComplete="off"
          />
          <Input
            label={t('pb.experience')}
            type="number"
            inputMode="numeric"
            min={0}
            max={70}
            value={years}
            onChange={(event) => setYears(event.target.value)}
          />
          <PhoneInput
            value={phone}
            onChange={setPhone}
            hint={isEmployee ? t('pb.yourPhoneHint') : undefined}
            error={submitted ? phoneError : undefined}
          />
          {isEmployee ? (
            <Callout tone="info">{t('pb.salonOwnsTheRest', { salon: salonName })}</Callout>
          ) : null}
        </div>
      </BottomSheet>

      {hoursOpen && schedule ? (
        <WeekHoursSheet
          open
          week={schedule.days}
          saving={savingHours}
          onClose={() => setHoursOpen(false)}
          onSave={saveHours}
          onCopyAll={() => toast('info', t('hours.copiedToast'))}
        />
      ) : null}
    </Screen>
  );
}
