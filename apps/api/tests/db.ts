import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { TEST_DATABASE_URL } from './testDbUrl';

// Реальный Prisma-клиент, подключённый к ТЕСТОВОЙ БД. Той же формы, что и боевой
// (src/db.ts), поэтому подходит под инъекцию db в buildApp без изменений роутов.
const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
export const testDb = new PrismaClient({ adapter });

// Изоляция между тестами: чистим все таблицы домена перед каждым тестом.
// CASCADE снимает FK-зависимости (профили ссылаются на User), RESTART IDENTITY
// обнуляет служебные счётчики. Это проще и надёжнее транзакционного отката с
// driver-адаптером Prisma.
export async function truncateAll(): Promise<void> {
  await testDb.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "Review", "LotAttachment", "DisputeAttachment", "Dispute", "Response", "SavedSearch", "Lot", "BloggerProfile", "CompanyProfile", "TicketAttachment", "TicketMessage", "SupportTicket", "User" RESTART IDENTITY CASCADE',
  );
}
