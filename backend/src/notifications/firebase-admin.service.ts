import { Injectable } from '@nestjs/common';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

const FIREBASE_SERVICE_ACCOUNT_JSON_ENV = 'FIREBASE_SERVICE_ACCOUNT_JSON';

@Injectable()
export class FirebaseAdminService {
  private readonly app: App;

  constructor() {
    this.app =
      getApps()[0] ??
      initializeApp({
        credential: this.createCredential(),
      });
  }

  getMessaging(): Messaging {
    return getMessaging(this.app);
  }

  private createCredential() {
    const serviceAccountJson = process.env[FIREBASE_SERVICE_ACCOUNT_JSON_ENV];

    if (!serviceAccountJson) {
      return applicationDefault();
    }

    return cert(JSON.parse(serviceAccountJson) as ServiceAccount);
  }
}
