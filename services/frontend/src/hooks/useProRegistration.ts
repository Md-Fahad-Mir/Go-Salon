import { useCallback, useState } from 'react';
import { areaLocation, locationFromPoint, nearestArea, type DhakaArea } from '../components/auth/areas';
import type { RegistrationBase } from '../types';
import { emailProblem, isValidPhone, nameError, passwordProblem, toE164 } from '../utils/validators';
import { useGeolocation } from './useGeolocation';

/** The half of a professional sign-up that is the same for a barber, an
    owner and an employee: who you are, how you sign in, and where you work.
    Each screen adds its own middle step and keeps this part identical, which
    is what stops the three drifting apart as they are edited. */
export function useProRegistration() {
  const geo = useGeolocation();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [area, setArea] = useState<DhakaArea | undefined>();
  const [terms, setTerms] = useState(false);

  /* A device fix and an area chip are alternatives, not a pair — picking one
     clears the other, so exactly one is ever active. */
  const geoLocation = geo.status === 'granted' ? locationFromPoint(geo.point) : undefined;
  const areaLocated = area ? areaLocation(area) : undefined;
  const location = geoLocation ?? areaLocated;

  const locate = useCallback(() => {
    setArea(undefined);
    geo.locate();
  }, [geo]);

  const pickArea = useCallback(
    (next: DhakaArea) => {
      geo.reset();
      setArea(next);
    },
    [geo],
  );

  const accountValid =
    isValidPhone(phone) &&
    !nameError(name) &&
    !emailProblem(email, true) &&
    !passwordProblem(password);

  /** The same, for a sign-up where the email is optional. */
  const accountValidWithoutEmail =
    isValidPhone(phone) &&
    !nameError(name) &&
    !emailProblem(email, false) &&
    !passwordProblem(password);

  const whereValid = Boolean(location && terms);

  /** The shared fields of the request, or null while the form is unfinished.
      Each screen spreads this and adds what its own account type needs. */
  const base = (): RegistrationBase | null =>
    location
      ? {
          phone: toE164(phone),
          name: name.trim(),
          email: email.trim() || undefined,
          password,
          location,
          acceptedTerms: terms,
        }
      : null;

  return {
    phone,
    accountValid,
    accountValidWithoutEmail,
    whereValid,
    base,
    /** Props for <RegisterStepAccount>. */
    account: {
      phone,
      name,
      email,
      password,
      onPhone: setPhone,
      onName: setName,
      onEmail: setEmail,
      onPassword: setPassword,
    },
    /** Props for <RegisterStepLocation>. */
    where: {
      geoStatus: geo.status,
      geoError: geo.error,
      geoArea: geo.status === 'granted' ? nearestArea(geo.point) : undefined,
      area,
      terms,
      onLocate: locate,
      onArea: pickArea,
      onTerms: setTerms,
    },
  };
}
