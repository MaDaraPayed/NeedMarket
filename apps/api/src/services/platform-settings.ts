import type { Db, PlatformSettingsRecord } from '../types';

const SINGLETON_ID = 'global';

// Возвращает текущие платформенные настройки, создавая строку-синглтон с дефолтами
// если она ещё не существует. Безопасно вызывать параллельно — upsert атомарен.
export async function getPlatformSettings(db: Db): Promise<PlatformSettingsRecord> {
  return db.platformSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, budgetFilterEnabled: false },
    update: {},
  });
}
