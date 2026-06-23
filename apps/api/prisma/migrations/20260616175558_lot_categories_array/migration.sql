-- Lot.category (String) -> Lot.categories (String[]) с переносом данных без потерь.

-- Старый индекс по одиночной категории больше не нужен.
DROP INDEX "Lot_category_idx";

-- Новая колонка-массив.
ALTER TABLE "Lot" ADD COLUMN "categories" TEXT[];

-- Переносим существующие данные: categories = [category].
UPDATE "Lot" SET "categories" = ARRAY["category"];

-- Удаляем старую одиночную колонку.
ALTER TABLE "Lot" DROP COLUMN "category";

-- GIN-индекс под array-containment (categories @> ARRAY[...]).
CREATE INDEX "Lot_categories_idx" ON "Lot" USING GIN ("categories");
