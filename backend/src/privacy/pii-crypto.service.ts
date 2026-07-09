import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';
import {
  PII_ENCRYPTION_KEY_ENV,
  PII_HASH_SECRET_ENV,
} from './privacy.constants';

const CIPHER_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const REQUIRED_KEY_BYTE_LENGTH = 32;

@Injectable()
export class PiiCryptoService {
  encrypt(value: string): string;
  encrypt(value: string | null | undefined): string | null;
  encrypt(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (this.isEncrypted(value)) {
      return value;
    }

    const iv = randomBytes(IV_BYTE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.getEncryptionKey(), iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      CIPHER_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string): string;
  decrypt(value: string | null | undefined): string | null;
  decrypt(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!this.isEncrypted(value)) {
      return value;
    }

    const [, iv, authTag, ciphertext] = value.split(':');

    if (!iv || !authTag || !ciphertext) {
      throw new Error('Invalid encrypted PII payload.');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.getEncryptionKey(),
      Buffer.from(iv, 'base64url'),
      {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      },
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  hash(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    return createHmac('sha256', this.getHashSecret())
      .update(value)
      .digest('base64url');
  }

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, '');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(`${CIPHER_VERSION}:`);
  }

  private getEncryptionKey(): Buffer {
    const configuredKey = process.env[PII_ENCRYPTION_KEY_ENV];
    const key = configuredKey
      ? Buffer.from(configuredKey, 'base64')
      : this.getNonProductionFallbackKey();

    if (key.length !== REQUIRED_KEY_BYTE_LENGTH) {
      throw new Error(
        `${PII_ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key.`,
      );
    }

    return key;
  }

  private getHashSecret(): string {
    const configuredSecret = process.env[PII_HASH_SECRET_ENV];

    if (configuredSecret) {
      return configuredSecret;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${PII_HASH_SECRET_ENV} is required in production.`);
    }

    return 'local-development-pii-hash-secret';
  }

  private getNonProductionFallbackKey(): Buffer {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${PII_ENCRYPTION_KEY_ENV} is required in production.`);
    }

    return Buffer.from('local-development-pii-key-32byte');
  }
}
