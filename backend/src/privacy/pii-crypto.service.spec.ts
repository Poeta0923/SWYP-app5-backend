import { PiiCryptoService } from './pii-crypto.service';

describe('PiiCryptoService', () => {
  let service: PiiCryptoService;

  beforeEach(() => {
    service = new PiiCryptoService();
  });

  it('encrypts the same plaintext to different ciphertexts', () => {
    const first = service.encrypt('user@example.com');
    const second = service.encrypt('user@example.com');

    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1:/);
    expect(second).toMatch(/^v1:/);
  });

  it('decrypts encrypted values back to plaintext', () => {
    const encrypted = service.encrypt('홍길동');

    expect(service.decrypt(encrypted)).toBe('홍길동');
  });

  it('creates stable hashes for normalized input', () => {
    const first = service.hash(service.normalizeEmail(' User@Example.COM '));
    const second = service.hash(service.normalizeEmail('user@example.com'));

    expect(first).toBe(second);
  });

  it('treats legacy plaintext as already decrypted', () => {
    expect(service.decrypt('legacy plaintext')).toBe('legacy plaintext');
  });
});
