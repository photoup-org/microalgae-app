-- Writes made on the LAN instance while the cloud was unreachable.
--
-- Only ever populated in the Pi's local replica; the authoritative Neon database
-- has the table but never a row. Both are built from one schema, so it exists in
-- both regardless.
--
-- See the note on the model in schema.prisma for why replaying these is safe: the
-- cloud refuses to move reactor state while the edge is unreachable, so a queued
-- entry has nothing to race against.

-- CreateTable
CREATE TABLE "OutboxEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "OutboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEntry_appliedAt_createdAt_idx" ON "OutboxEntry"("appliedAt", "createdAt");

