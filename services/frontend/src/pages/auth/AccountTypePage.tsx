import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ACCOUNT_TYPE_BLURB_KEYS,
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_KEYS,
} from '../../components/auth/accountTypes';
import { Callout } from '../../components/common/Callout';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { REGISTER_ROUTE_FOR, REGISTRABLE_ACCOUNT_TYPES, ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import type { RegistrableAccountType } from '../../types';

/** The fork in sign-up: which account is being created.

    Three options. A women's barber picks Barber / Hairstylist and says who
    their clients are; a parlour picks Salon / Parlour Owner and says what kind
    of place it is. Neither is an account type of its own.

    Salon and parlour employees are the fourth account type and are not here:
    an owner creates their account when they add the chair, so the only thing
    this screen owes them is a clear pointer to sign in. */
export default function AccountTypePage() {
  const t = useT();
  const navigate = useNavigate();
  const { chooseAccountType } = useAuth();
  const EmployeeIcon = ACCOUNT_TYPE_ICONS.salon_employee;

  const pick = (type: RegistrableAccountType) => {
    chooseAccountType(type);
    navigate(REGISTER_ROUTE_FOR[type]);
  };

  return (
    <Screen>
      <Header back backTo={ROUTES.welcome} />
      <ScreenBody className="auth-body">
        <div className="auth-intro">
          <h2>{t('auth.chooseTypeTitle')}</h2>
          <p>{t('auth.chooseTypeSub')}</p>
        </div>

        <div className="auth-types">
          {REGISTRABLE_ACCOUNT_TYPES.map((type) => {
            const Icon = ACCOUNT_TYPE_ICONS[type];
            return (
              <button key={type} type="button" className="auth-type" onClick={() => pick(type)}>
                <span className="auth-type-icon" aria-hidden="true"><Icon size={22} /></span>
                <span className="auth-type-body">
                  <strong>{t(ACCOUNT_TYPE_KEYS[type])}</strong>
                  <small>{t(ACCOUNT_TYPE_BLURB_KEYS[type])}</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="auth-type-end" />
              </button>
            );
          })}
        </div>

        {/* Not an option, and deliberately not shaped like one: no sign-up
            exists for an employee, so this only says where to go instead. */}
        <Callout
          tone="info"
          className="auth-employee-note"
          icon={<EmployeeIcon size={18} aria-hidden="true" />}
          title={t('auth.typeEmployee')}
        >
          <p>{t('auth.employeeNoteBody')}</p>
          <Link to={ROUTES.login} className="link-btn">{t('auth.employeeNoteAction')}</Link>
        </Callout>

        <p className="auth-foot-link small dim center">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to={ROUTES.login} className="link-btn">{t('auth.signIn')}</Link>
        </p>
      </ScreenBody>
    </Screen>
  );
}
