import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { PiiCryptoService } from '../src/privacy/pii-crypto.service';

const piiCryptoService = new PiiCryptoService();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, { disposeExternalPool: true }),
});

const dryRun = process.argv.includes('--dry-run');

const encrypt = (value: string | null | undefined) =>
  value ? piiCryptoService.encrypt(value) : value;

const encryptRequired = (value: string) => piiCryptoService.encrypt(value);

const hashEmail = (email: string | null | undefined) =>
  email
    ? piiCryptoService.hash(piiCryptoService.normalizeEmail(email))
    : null;

const hashPhoneNumber = (phoneNumber: string) =>
  piiCryptoService.hash(piiCryptoService.normalizePhoneNumber(phoneNumber));

const toBirthDateParts = (birthDate: string | null) => {
  if (!birthDate) {
    return {
      birthMonth: null,
      birthDay: null,
    };
  }

  const plaintext = piiCryptoService.decrypt(birthDate);
  const parsedDate = new Date(plaintext);

  return {
    birthMonth: parsedDate.getUTCMonth() + 1,
    birthDay: parsedDate.getUTCDate(),
  };
};

async function main() {
  let changedRows = 0;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      emailHash: true,
    },
  });

  for (const user of users) {
    const email = user.email;

    if (!email || (piiCryptoService.isEncrypted(email) && user.emailHash)) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: encrypt(email),
          emailHash: hashEmail(email),
        },
      });
    }
  }

  const people = await prisma.person.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      phoneNumber: true,
      phoneNumberHash: true,
      birthDate: true,
      birthMonth: true,
      birthDay: true,
    },
  });

  for (const person of people) {
    const needsUpdate =
      !piiCryptoService.isEncrypted(person.name) ||
      !piiCryptoService.isEncrypted(person.phoneNumber) ||
      !person.phoneNumberHash ||
      (person.birthDate &&
        (!piiCryptoService.isEncrypted(person.birthDate) ||
          !person.birthMonth ||
          !person.birthDay));

    if (!needsUpdate) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.person.update({
        where: {
          id_userId: {
            id: person.id,
            userId: person.userId,
          },
        },
        data: {
          name: encryptRequired(person.name),
          phoneNumber: encryptRequired(person.phoneNumber),
          phoneNumberHash: hashPhoneNumber(person.phoneNumber),
          birthDate: encrypt(person.birthDate),
          ...toBirthDateParts(person.birthDate),
        },
      });
    }
  }

  const extraContacts = await prisma.extraContact.findMany({
    select: {
      id: true,
      content: true,
    },
  });

  for (const extraContact of extraContacts) {
    if (piiCryptoService.isEncrypted(extraContact.content)) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.extraContact.update({
        where: { id: extraContact.id },
        data: { content: encryptRequired(extraContact.content) },
      });
    }
  }

  const schedules = await prisma.schedule.findMany({
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  for (const schedule of schedules) {
    if (
      piiCryptoService.isEncrypted(schedule.title) &&
      (!schedule.content || piiCryptoService.isEncrypted(schedule.content))
    ) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          title: encryptRequired(schedule.title),
          content: encrypt(schedule.content),
        },
      });
    }
  }

  const records = await prisma.record.findMany({
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  for (const record of records) {
    if (
      piiCryptoService.isEncrypted(record.title) &&
      (!record.content || piiCryptoService.isEncrypted(record.content))
    ) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.record.update({
        where: { id: record.id },
        data: {
          title: encryptRequired(record.title),
          content: encrypt(record.content),
        },
      });
    }
  }

  const recordMemos = await prisma.recordMemo.findMany({
    select: {
      id: true,
      content: true,
    },
  });

  for (const recordMemo of recordMemos) {
    if (piiCryptoService.isEncrypted(recordMemo.content)) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.recordMemo.update({
        where: { id: recordMemo.id },
        data: { content: encryptRequired(recordMemo.content) },
      });
    }
  }

  const notifications = await prisma.notification.findMany({
    select: {
      id: true,
      title: true,
      body: true,
    },
  });

  for (const notification of notifications) {
    if (
      piiCryptoService.isEncrypted(notification.title) &&
      piiCryptoService.isEncrypted(notification.body)
    ) {
      continue;
    }

    changedRows += 1;

    if (!dryRun) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          title: encryptRequired(notification.title),
          body: encryptRequired(notification.body),
        },
      });
    }
  }

  console.log(
    dryRun
      ? `PII encryption backfill dry-run: ${changedRows} rows would change.`
      : `PII encryption backfill complete: ${changedRows} rows changed.`,
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
