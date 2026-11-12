import jwt from 'jsonwebtoken';
import { expect, it } from 'vitest';
import { accreditationSubject } from '../src/modules/identity/graduate-accreditation.service.js';

const applicant = '5ca02d3d-a3b1-4843-a00e-7107f4a08041';

it('allows case access only with a valid accreditation token', () => {
  const secret = process.env.JWT_SECRET;
  const access = jwt.sign({}, secret, { subject: applicant, audience: 'ranti-graduate-accreditation', expiresIn: '1m' });
  expect(accreditationSubject(access)).toBe(applicant);
  expect(accreditationSubject).toThrowError(/credenciales de acreditación/);
  expect(() => accreditationSubject(jwt.sign({ id: applicant, role: 'Administrador' }, secret))).toThrowError(/credenciales de acreditación/);
  const expired = jwt.sign({}, secret, { subject: applicant, audience: 'ranti-graduate-accreditation', expiresIn: -1 });
  expect(() => accreditationSubject(expired)).toThrowError(/credenciales de acreditación/);
});
