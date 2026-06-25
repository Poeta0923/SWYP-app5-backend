import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  AWS_ACCESS_KEY_ID_ENV,
  AWS_REGION_ENV,
  AWS_S3_BUCKET_NAME_ENV,
  AWS_SECRET_ACCESS_KEY_ENV,
  CLOUDFRONT_KEY_PAIR_ID_ENV,
  CLOUDFRONT_DOMAIN_ENV,
  CLOUDFRONT_PRIVATE_KEY_ENV,
  CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS_ENV,
  DEFAULT_CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS,
  DEFAULT_S3_CACHE_CONTROL,
} from './s3.constants';

export interface UploadS3FileInput {
  body: Buffer | Uint8Array | string;
  contentType: string;
  originalName?: string;
  prefix?: string;
  key?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface UploadedS3File {
  bucket: string;
  key: string;
  url: string;
  contentType: string;
  size: number;
}

@Injectable()
export class S3Service {
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  async uploadFile(input: UploadS3FileInput): Promise<UploadedS3File> {
    const key = input.key
      ? this.normalizeS3Key(input.key)
      : this.createObjectKey(input.prefix, input.originalName);
    const bucketName = this.getBucketName();
    const url = this.getPublicUrl(key);

    await this.getS3Client().send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? DEFAULT_S3_CACHE_CONTROL,
        Metadata: input.metadata,
      }),
    );

    return {
      bucket: bucketName,
      key,
      url,
      contentType: input.contentType,
      size: this.getBodySize(input.body),
    };
  }

  async deleteFile(key: string): Promise<void> {
    await this.getS3Client().send(
      new DeleteObjectCommand({
        Bucket: this.getBucketName(),
        Key: this.normalizeS3Key(key),
      }),
    );
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteFile(key)));
  }

  getPublicUrl(key: string): string {
    return `https://${this.getCloudFrontDomain()}/${this.encodeS3KeyForUrl(key)}`;
  }

  getSignedUrl(key: string, expiresInSeconds?: number): string {
    const expiresAt = new Date(
      Date.now() + this.getSignedUrlExpiresSeconds(expiresInSeconds) * 1000,
    );

    return getCloudFrontSignedUrl({
      url: this.getPublicUrl(key),
      keyPairId: this.getRequiredConfig(CLOUDFRONT_KEY_PAIR_ID_ENV),
      privateKey: this.getCloudFrontPrivateKey(),
      dateLessThan: expiresAt.toISOString(),
    });
  }

  private createObjectKey(prefix: string | undefined, originalName?: string) {
    const normalizedPrefix = this.normalizeS3Prefix(prefix);
    const extension = this.getSafeExtension(originalName);
    const filename = `${randomUUID()}${extension}`;

    return normalizedPrefix ? `${normalizedPrefix}/${filename}` : filename;
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required to use S3.`);
    }

    return value;
  }

  private getS3Client(): S3Client {
    if (this.s3Client) {
      return this.s3Client;
    }

    this.s3Client = new S3Client({
      region: this.getRequiredConfig(AWS_REGION_ENV),
      credentials: {
        accessKeyId: this.getRequiredConfig(AWS_ACCESS_KEY_ID_ENV),
        secretAccessKey: this.getRequiredConfig(AWS_SECRET_ACCESS_KEY_ENV),
      },
    });

    return this.s3Client;
  }

  private getBucketName(): string {
    return this.getRequiredConfig(AWS_S3_BUCKET_NAME_ENV);
  }

  private getCloudFrontDomain(): string {
    return this.normalizeCloudFrontDomain(
      this.getRequiredConfig(CLOUDFRONT_DOMAIN_ENV),
    );
  }

  private getCloudFrontPrivateKey(): string {
    return this.getRequiredConfig(CLOUDFRONT_PRIVATE_KEY_ENV).replace(
      /\\n/g,
      '\n',
    );
  }

  private getSignedUrlExpiresSeconds(expiresInSeconds?: number): number {
    if (expiresInSeconds !== undefined) {
      return this.assertPositiveInteger(expiresInSeconds, 'expiresInSeconds');
    }

    const configuredValue = this.configService.get<string>(
      CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS_ENV,
    );

    if (!configuredValue) {
      return DEFAULT_CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS;
    }

    return this.assertPositiveInteger(
      Number(configuredValue),
      CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS_ENV,
    );
  }

  private normalizeS3Prefix(prefix?: string): string {
    if (!prefix) {
      return '';
    }

    return prefix
      .split('/')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part !== '.' && part !== '..')
      .join('/');
  }

  private normalizeS3Key(key: string): string {
    const normalizedKey = key.trim().replace(/^\/+/, '');

    if (!normalizedKey) {
      throw new Error('S3 key is required.');
    }

    return normalizedKey;
  }

  private normalizeCloudFrontDomain(domain: string): string {
    return domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
  }

  private encodeS3KeyForUrl(key: string): string {
    return this.normalizeS3Key(key)
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private getSafeExtension(originalName?: string): string {
    if (!originalName) {
      return '';
    }

    return extname(originalName)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '');
  }

  private getBodySize(body: Buffer | Uint8Array | string): number {
    if (typeof body === 'string') {
      return Buffer.byteLength(body);
    }

    return body.byteLength;
  }

  private assertPositiveInteger(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${label} must be a positive integer.`);
    }

    return value;
  }
}
