import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/auth/PasswordInput';
import { authErrorMessage, fieldMessage } from '../../components/auth/errors';
import { Button } from '../../components/common/Button';
import { Callout } from '../../components/common/Callout';
import { Header } from '../../components/layout/Header';
import { Screen, ScreenBody } from '../../components/layout/Screen';
import { useAuth } from '../../hooks/useAuth';
import { useT } from '../../hooks/useLanguage';
import { useAppStore } from '../../store/useAppStore';
import { ApiValidationError } from '../../utils/apiClient';
import { passwordProblem } from '../../utils/validators';

/** Changing a password from inside the app.

    The current one is the proof, and the backend ends every other session
    when it succeeds — handing this device a fresh pair so the person doing
    the changing is not signed out by their own change. */
export default function ChangePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { changePassword } = useAuth();
  const toast = useAppStore((state) => state.toast);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiValidationError | null>(null);

  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && !passwordProblem(next) && confirm === next;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      await changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      toast('success', t('auth.changePasswordDone'), t('auth.changePasswordDoneBody'));
      navigate(-1);
    } catch (error) {
      setFailure(error instanceof ApiValidationError ? error : null);
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header back title={t('auth.changePasswordTitle')} />
      <ScreenBody>
        <form className="stack-lg pf-password" onSubmit={(event) => void submit(event)} noValidate>
          <p className="caption">{t('auth.changePasswordSub')}</p>

          {failure && !fieldMessage(failure, 'current_password') ? (
            <Callout tone="danger" icon={<AlertCircle size={18} aria-hidden="true" />}>
              {authErrorMessage(t, failure)}
            </Callout>
          ) : null}

          <div className="stack">
            <PasswordInput
              value={current}
              onChange={(value) => {
                setCurrent(value);
                if (failure) setFailure(null);
              }}
              label={t('auth.currentPasswordLabel')}
              autoComplete="current-password"
              meter={false}
              rules={false}
              error={
                fieldMessage(failure, 'current_password') ??
                (failure?.code === 'invalid_password' ? authErrorMessage(t, failure) : undefined)
              }
            />
            <PasswordInput
              value={next}
              onChange={setNext}
              label={t('auth.newPasswordLabel')}
              hint={t('auth.passwordRule')}
              error={fieldMessage(failure, 'new_password')}
            />
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              label={t('auth.confirmPasswordLabel')}
              meter={false}
              rules={false}
              error={mismatch ? t('auth.errPasswordMatch') : undefined}
            />
          </div>

          <Button type="submit" block size="lg" disabled={!ready} loading={saving}>
            {t('auth.changePasswordAction')}
          </Button>
        </form>
      </ScreenBody>
    </Screen>
  );
}
