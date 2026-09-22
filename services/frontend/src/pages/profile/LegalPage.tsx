import { ROUTES } from '../../constants';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';

/** The terms and the privacy notice, which are the same page with a different
 *  list of sections — one heading and one or more paragraphs each.
 *
 *  Kept as translation keys rather than as prose in the component, because
 *  these are the two documents most likely to be read in Bangla, and a wall of
 *  English inside a .tsx file is a wall nobody can translate.
 */

interface Clause {
  head: TKey;
  body: TKey[];
}

const TERMS: Clause[] = [
  { head: 'legal.termsWhoHead', body: ['legal.termsWhoBody'] },
  { head: 'legal.termsBookingHead', body: ['legal.termsBookingBody1', 'legal.termsBookingBody2'] },
  { head: 'legal.termsPayHead', body: ['legal.termsPayBody'] },
  { head: 'legal.termsCancelHead', body: ['legal.termsCancelBody'] },
  { head: 'legal.termsTryOnHead', body: ['legal.termsTryOnBody'] },
  { head: 'legal.termsReviewHead', body: ['legal.termsReviewBody'] },
  { head: 'legal.termsAccountHead', body: ['legal.termsAccountBody'] },
  { head: 'legal.termsChangeHead', body: ['legal.termsChangeBody'] },
];

const PRIVACY: Clause[] = [
  { head: 'legal.privacyKeepHead', body: ['legal.privacyKeepBody'] },
  { head: 'legal.privacySalonHead', body: ['legal.privacySalonBody'] },
  { head: 'legal.privacyPhotoHead', body: ['legal.privacyPhotoBody1', 'legal.privacyPhotoBody2'] },
  { head: 'legal.privacyPhoneHead', body: ['legal.privacyPhoneBody'] },
  { head: 'legal.privacyDeviceHead', body: ['legal.privacyDeviceBody'] },
  { head: 'legal.privacySellHead', body: ['legal.privacySellBody'] },
  { head: 'legal.privacyAskHead', body: ['legal.privacyAskBody'] },
];

export default function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const t = useT();
  const terms = doc === 'terms';
  const clauses = terms ? TERMS : PRIVACY;

  return (
    <Screen nav>
      <Header
        title={t(terms ? 'settings.terms' : 'settings.privacyPolicy')}
        back
        backTo={ROUTES.profileSettings}
      />
      <ScreenBody className="pf-screen pf-legal stagger">
        <p className="caption pf-legal-stamp">{t('legal.lastUpdated')}</p>

        {clauses.map((clause) => (
          <section className="section" key={clause.head}>
            <h3>{t(clause.head)}</h3>
            {clause.body.map((line) => (
              <p key={line}>{t(line)}</p>
            ))}
          </section>
        ))}

        <p className="caption">{t('legal.contact')}</p>
      </ScreenBody>
    </Screen>
  );
}
