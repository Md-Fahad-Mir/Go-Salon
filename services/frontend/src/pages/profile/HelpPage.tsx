import { ChevronDown, Mail, MessageCircle, Phone } from 'lucide-react';
import { DEFAULT_CANCELLATION_HOURS, CREDIT_PACK_PRICE, CREDIT_PACK_SIZE, ROUTES, STARTING_CREDITS } from '../../constants';
import { ListCard, ListRow } from '../../components/common/ListRow';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useT } from '../../hooks/useLanguage';
import type { TKey } from '../../i18n';
import { formatBdt, formatNumber } from '../../utils/format';

const FAQ_KEYS: Array<{ q: TKey; a: TKey[] }> = [
  { q: 'profile.faqCancelQ', a: ['profile.policy1', 'profile.policy2', 'profile.policy3'] },
  { q: 'profile.faqCreditsQ', a: ['profile.faqCreditsA1', 'profile.faqCreditsA2'] },
  { q: 'profile.faqTryOnQ', a: ['profile.faqTryOnA1', 'profile.faqTryOnA2'] },
  { q: 'profile.faqPayQ', a: ['profile.faqPayA1', 'profile.faqPayA2'] },
  { q: 'profile.faqMoveQ', a: ['profile.faqMoveA1'] },
  { q: 'profile.faqReviewsQ', a: ['profile.faqReviewsA1', 'profile.faqReviewsA2'] },
];

export default function HelpPage() {
  const t = useT();
  const vars = {
    hours: formatNumber(DEFAULT_CANCELLATION_HOURS),
    credits: formatNumber(STARTING_CREDITS),
    pack: formatNumber(CREDIT_PACK_SIZE),
    price: formatBdt(CREDIT_PACK_PRICE),
  };

  return (
    <Screen nav>
      <Header title={t('profile.help')} back backTo={ROUTES.profile} />
      <ScreenBody className="pf-screen pf-help stagger">
        <section className="section" aria-labelledby="pf-contact">
          <h3 className="label" id="pf-contact">{t('profile.talkToUs')}</h3>
          <ListCard className="pf-list">
            <ListRow
              icon={<MessageCircle size={18} aria-hidden="true" />}
              title={t('profile.whatsapp')}
              sub={t('profile.whatsappHours')}
              href="https://wa.me/8801700000000"
            />
            <ListRow icon={<Mail size={18} aria-hidden="true" />} title={t('profile.emailUs')} sub="support@eureka.app" href="mailto:support@eureka.app" />
            <ListRow icon={<Phone size={18} aria-hidden="true" />} title={t('profile.callSupport')} sub="+880 1700-000000" href="tel:+8801700000000" />
          </ListCard>
        </section>

        <section className="section" aria-labelledby="pf-faq">
          <h3 className="label" id="pf-faq">{t('profile.commonQuestions')}</h3>
          {/* One bound volume of questions rather than six loose boxes. */}
          <div className="stack-sm pf-faq-list">
            {FAQ_KEYS.map((item) => (
              <details key={item.q} className="pf-faq">
                <summary>
                  <span>{t(item.q)}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div className="pf-faq-body">
                  {item.a.map((paragraph) => (
                    <p key={paragraph}>{t(paragraph, vars)}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <p className="caption center pf-signoff">{t('profile.stillStuck')}</p>
      </ScreenBody>
    </Screen>
  );
}
