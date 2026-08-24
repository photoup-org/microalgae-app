-- The firmware version a node reports on its retained nodes/{id}/metadata topic.
--
-- The worker already parsed this into ota_dispatcher.node_versions to decide who
-- needs an update, but only in memory, and device_registrar.handle_metadata
-- returns early for a known device - so a version change after an OTA never
-- reached the cloud at all.
--
-- firmwareReportedAt travels with it because the topic is retained: an unplugged
-- node still has a version on file, and a column that cannot say how stale it is
-- would present a guess as a fact.

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "firmwareReportedAt" TIMESTAMP(3),
ADD COLUMN     "firmwareVersion" TEXT;

