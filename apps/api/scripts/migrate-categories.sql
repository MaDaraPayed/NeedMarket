-- Миграция категорий: старые 8 значений → новые 38.
-- Маппинг: Бьюти→Красота, Еда→Питание, Тех→IT;
-- Лайфстайл/Услуги/Игры/Спорт/Образование — без изменений;
-- Любое неизвестное значение → Другое.
--
-- Запустить: psql $DATABASE_URL -f migrate-categories.sql

BEGIN;

-- Вспомогательная функция маппинга одного значения
CREATE OR REPLACE FUNCTION _map_category(cat TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN CASE cat
    WHEN 'Бьюти'     THEN 'Красота'
    WHEN 'Еда'       THEN 'Питание'
    WHEN 'Тех'       THEN 'IT'
    -- Без изменений (уже в новом справочнике)
    WHEN 'Лайфстайл'   THEN 'Лайфстайл'
    WHEN 'Услуги'      THEN 'Услуги'
    WHEN 'Игры'        THEN 'Игры'
    WHEN 'Спорт'       THEN 'Спорт'
    WHEN 'Образование' THEN 'Образование'
    -- Новые значения, если уже попали в БД — оставить
    WHEN 'Дети'           THEN 'Дети'
    WHEN 'Домашние животные' THEN 'Домашние животные'
    WHEN 'Материнство'    THEN 'Материнство'
    WHEN 'Семья'          THEN 'Семья'
    WHEN 'Красота'        THEN 'Красота'
    WHEN 'Мода'           THEN 'Мода'
    WHEN 'Фотография'     THEN 'Фотография'
    WHEN 'Здоровье'       THEN 'Здоровье'
    WHEN 'Кулинария'      THEN 'Кулинария'
    WHEN 'Медицина'       THEN 'Медицина'
    WHEN 'Питание'        THEN 'Питание'
    WHEN 'Рестораны'      THEN 'Рестораны'
    WHEN 'Авто'           THEN 'Авто'
    WHEN 'Недвижимость'   THEN 'Недвижимость'
    WHEN 'Путешествия'    THEN 'Путешествия'
    WHEN 'Туризм'         THEN 'Туризм'
    WHEN 'Бизнес'         THEN 'Бизнес'
    WHEN 'Товары'         THEN 'Товары'
    WHEN 'Финансы'        THEN 'Финансы'
    WHEN 'IT'             THEN 'IT'
    WHEN 'Искусственный интеллект' THEN 'Искусственный интеллект'
    WHEN 'Искусство'      THEN 'Искусство'
    WHEN 'Кино'           THEN 'Кино'
    WHEN 'Музыка'         THEN 'Музыка'
    WHEN 'Юмор'           THEN 'Юмор'
    WHEN 'Психология'     THEN 'Психология'
    WHEN 'Саморазвитие'   THEN 'Саморазвитие'
    WHEN 'Благотворительность' THEN 'Благотворительность'
    WHEN 'Государственные проекты' THEN 'Государственные проекты'
    WHEN 'Локальный блог' THEN 'Локальный блог'
    WHEN 'Новости'        THEN 'Новости'
    WHEN 'Экология'       THEN 'Экология'
    WHEN 'Другое'         THEN 'Другое'
    ELSE 'Другое'  -- любое неизвестное → Другое
  END;
END;
$$ LANGUAGE plpgsql;

-- Функция для миграции массива (маппинг + DISTINCT для схлопывания дублей)
CREATE OR REPLACE FUNCTION _migrate_categories(arr TEXT[]) RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT _map_category(elem)
    FROM unnest(arr) AS elem
  );
END;
$$ LANGUAGE plpgsql;

-- Отчёт: какие старые значения встречаются в данных
SELECT 'BloggerProfile.categories' AS source, elem, count(*) AS cnt
FROM "BloggerProfile", unnest(categories) AS elem
WHERE elem IN ('Бьюти', 'Еда', 'Тех')
GROUP BY elem
UNION ALL
SELECT 'BloggerProfile.preferredAdvertiserCategories', elem, count(*)
FROM "BloggerProfile", unnest("preferredAdvertiserCategories") AS elem
WHERE elem IN ('Бьюти', 'Еда', 'Тех')
GROUP BY elem
UNION ALL
SELECT 'Lot.categories', elem, count(*)
FROM "Lot", unnest(categories) AS elem
WHERE elem IN ('Бьюти', 'Еда', 'Тех')
GROUP BY elem
UNION ALL
SELECT 'SavedSearch.categories', elem, count(*)
FROM "SavedSearch", unnest(categories) AS elem
WHERE elem IN ('Бьюти', 'Еда', 'Тех')
GROUP BY elem
ORDER BY source, elem;

-- Миграция BloggerProfile.categories
UPDATE "BloggerProfile"
SET categories = _migrate_categories(categories)
WHERE cardinality(categories) > 0
  AND categories && ARRAY['Бьюти', 'Еда', 'Тех'];

-- Миграция BloggerProfile.preferredAdvertiserCategories
UPDATE "BloggerProfile"
SET "preferredAdvertiserCategories" = _migrate_categories("preferredAdvertiserCategories")
WHERE cardinality("preferredAdvertiserCategories") > 0
  AND "preferredAdvertiserCategories" && ARRAY['Бьюти', 'Еда', 'Тех'];

-- Миграция Lot.categories
UPDATE "Lot"
SET categories = _migrate_categories(categories)
WHERE cardinality(categories) > 0
  AND categories && ARRAY['Бьюти', 'Еда', 'Тех'];

-- Миграция SavedSearch.categories
UPDATE "SavedSearch"
SET categories = _migrate_categories(categories)
WHERE cardinality(categories) > 0
  AND categories && ARRAY['Бьюти', 'Еда', 'Тех'];

-- Уборка вспомогательных функций
DROP FUNCTION _map_category(TEXT);
DROP FUNCTION _migrate_categories(TEXT[]);

COMMIT;

-- Запустить: psql $DATABASE_URL -f apps/api/scripts/migrate-categories.sql
