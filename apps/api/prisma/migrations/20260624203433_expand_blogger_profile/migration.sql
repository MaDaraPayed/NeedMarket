-- CreateEnum
CREATE TYPE "AudienceGender" AS ENUM ('mostly_female', 'mostly_male', 'mixed');

-- CreateEnum
CREATE TYPE "CollabFormat" AS ENUM ('stories', 'stories_series', 'reels', 'posts', 'video_reviews', 'interviews', 'live_streams', 'brand_ambassador', 'events', 'ugc');

-- AlterTable
ALTER TABLE "BloggerProfile" ADD COLUMN     "audienceAge" TEXT,
ADD COLUMN     "audienceGender" "AudienceGender",
ADD COLUMN     "audienceGeo" TEXT,
ADD COLUMN     "audienceLanguage" TEXT,
ADD COLUMN     "avgPrice3m" INTEGER,
ADD COLUMN     "barterAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bestCaseUrl" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "brandsWorkedWith" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "engagementRate" DOUBLE PRECISION,
ADD COLUMN     "formats" "CollabFormat"[] DEFAULT ARRAY[]::"CollabFormat"[],
ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferredAdvertiserCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "priceEvent" INTEGER,
ADD COLUMN     "pricePost" INTEGER,
ADD COLUMN     "priceReels" INTEGER,
ADD COLUMN     "priceStories" INTEGER,
ADD COLUMN     "priceStoriesSeries" INTEGER,
ADD COLUMN     "priceUgc" INTEGER,
ADD COLUMN     "reachPosts" INTEGER,
ADD COLUMN     "reachReels" INTEGER,
ADD COLUMN     "reachStories" INTEGER,
ADD COLUMN     "statsScreenshotUrl" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "travelAvailable" BOOLEAN NOT NULL DEFAULT false;
