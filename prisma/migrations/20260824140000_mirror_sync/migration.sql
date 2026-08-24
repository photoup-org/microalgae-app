-- Records when the read-only cloud mirror was last refreshed.
--
-- The mirror is a copy of the Pi's database that the cloud instance reads when the
-- Pi is unreachable. Stale rows presented as current would be worse than an error
-- page, so the fallback banner states the age of what it is showing, and this is
-- where that timestamp comes from.
--
-- Created in both databases because both are built from one schema. In the primary
-- the table simply stays empty.

-- CreateTable
CREATE TABLE "MirrorSync" (
    "id" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "rowCounts" JSONB,

    CONSTRAINT "MirrorSync_pkey" PRIMARY KEY ("id")
);

