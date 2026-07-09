import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

jest.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: jest.fn(({ url }: { url: string }) => `${url}?signed=true`),
}));

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );

  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
  };
});

describe('S3Service', () => {
  const configValues = {
    AWS_REGION: 'ap-northeast-2',
    AWS_S3_BUCKET_NAME: 'swyp-bucket',
    AWS_ACCESS_KEY_ID: 'access-key',
    AWS_SECRET_ACCESS_KEY: 'secret-key',
    CLOUDFRONT_DOMAIN: 'https://cdn.example.com/',
    CLOUDFRONT_KEY_PAIR_ID: 'cloudfront-key-id',
    CLOUDFRONT_PRIVATE_KEY:
      '-----BEGIN RSA PRIVATE KEY-----\\nprivate-key\\n-----END RSA PRIVATE KEY-----',
    CLOUDFRONT_SIGNED_URL_EXPIRES_SECONDS: '300',
  };

  let service: S3Service;
  let configService: Pick<ConfigService, 'get'>;

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: keyof typeof configValues) => configValues[key]),
    };

    service = new S3Service(configService as ConfigService);
  });

  it('uploads a file and returns a CloudFront URL', async () => {
    const result = await service.uploadFile({
      body: Buffer.from('image'),
      contentType: 'image/png',
      originalName: 'PROFILE.PNG',
      prefix: '/users/user-1/profile/',
    });

    const send = getLatestS3Send();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;

    expect(command.input).toMatchObject({
      Bucket: 'swyp-bucket',
      Body: Buffer.from('image'),
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(command.input.Key).toMatch(/^users\/user-1\/profile\/.+\.png$/);
    expect(result).toEqual({
      bucket: 'swyp-bucket',
      key: command.input.Key,
      url: `https://cdn.example.com/${command.input.Key}`,
      contentType: 'image/png',
      size: 5,
    });
  });

  it('uploads using an explicit object key', async () => {
    await service.uploadFile({
      body: 'file-body',
      contentType: 'text/plain',
      key: '/uploads/manual-key.txt',
    });

    const send = getLatestS3Send();
    const command = send.mock.calls[0][0] as PutObjectCommand;

    expect(command.input.Key).toBe('uploads/manual-key.txt');
  });

  it('deletes a file by key', async () => {
    await service.deleteFile('/uploads/manual-key.txt');

    const send = getLatestS3Send();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as DeleteObjectCommand;

    expect(command.input).toEqual({
      Bucket: 'swyp-bucket',
      Key: 'uploads/manual-key.txt',
    });
  });

  it('creates a signed CloudFront URL', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T00:00:00.000Z'));
    const { getSignedUrl } = jest.requireMock('@aws-sdk/cloudfront-signer');

    const signedUrl = service.getSignedUrl('/uploads/manual key.txt');

    expect(signedUrl).toBe(
      'https://cdn.example.com/uploads/manual%20key.txt?signed=true',
    );
    expect(getSignedUrl).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/uploads/manual%20key.txt',
      keyPairId: 'cloudfront-key-id',
      privateKey:
        '-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----',
      dateLessThan: '2026-06-25T00:05:00.000Z',
    });

    jest.useRealTimers();
  });

  it('throws when required config is missing', async () => {
    configService = {
      get: jest.fn((key: keyof typeof configValues) =>
        key === 'AWS_S3_BUCKET_NAME' ? undefined : configValues[key],
      ),
    };

    service = new S3Service(configService as ConfigService);

    await expect(
      service.uploadFile({
        body: 'file-body',
        contentType: 'text/plain',
        key: 'uploads/manual-key.txt',
      }),
    ).rejects.toThrow('AWS_S3_BUCKET_NAME is required to use S3.');
  });

  const getLatestS3Send = (): jest.Mock => {
    const s3ClientMock = S3Client as unknown as jest.Mock;
    const latestResult = s3ClientMock.mock.results.at(-1);

    if (!latestResult) {
      throw new Error('S3Client was not created.');
    }

    return latestResult.value.send;
  };
});
