-- Baseline for this app's OWN database.
--
-- Until now schema.prisma here was a read-only mirror of app-gui's, and both apps
-- pointed at the same Neon instance. That arrangement cannot survive the reactor
-- database moving onto the Pi: the Pi is not publicly reachable, so a shared
-- database would take app-gui down with it.
--
-- So the databases are split. app-gui keeps Neon and its own schema; this app owns
-- the schema below outright, and prisma migrate runs from this repo from now on.
--
-- Generated with:
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- Note this is the subset app-gui had, minus every commercial model (Organization,
-- Department, PlanTier, Order, ...). departmentId survives as a plain string column
-- with no foreign key behind it - it identifies the deployment, and nothing here
-- needs a table to point at.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'SUPER_ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('UNCLAIMED', 'ACTIVE', 'MAINTENANCE', 'PENDING_CONNECTION', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "HardwareType" AS ENUM ('GATEWAY', 'SENSOR_BASE', 'SENSOR_PREMIUM');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LogCategory" AS ENUM ('EXPERIMENT', 'ALERT', 'HARDWARE', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "auth0UserId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "jobTitle" TEXT,
    "phone" TEXT,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'RUNNING',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "settings" JSONB,
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "serialNumber" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "productId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "config" JSONB DEFAULT '{}',
    "calibrationConfig" JSONB,
    "lastCalibrated" TIMESTAMP(3),
    "calibrationDueDate" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardwareProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HardwareType" NOT NULL,

    CONSTRAINT "HardwareProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "category" "LogCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "departmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "experimentId" TEXT,
    "deviceId" TEXT,
    "dedupKey" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calibratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "performedBy" TEXT NOT NULL,
    "notes" TEXT,
    "pointsApplied" JSONB,
    "oldConfig" JSONB,
    "newConfig" JSONB,
    "metric" TEXT,

    CONSTRAINT "CalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DeviceProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DeviceToExperiment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0UserId_key" ON "User"("auth0UserId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HardwareProduct_sku_key" ON "HardwareProduct"("sku");

-- CreateIndex
CREATE INDEX "SystemLog_departmentId_timestamp_idx" ON "SystemLog"("departmentId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "SystemLog_departmentId_dedupKey_acknowledgedAt_idx" ON "SystemLog"("departmentId", "dedupKey", "acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_departmentId_idx" ON "PushSubscription"("departmentId");

-- CreateIndex
CREATE INDEX "CalibrationRecord_deviceId_calibratedAt_idx" ON "CalibrationRecord"("deviceId", "calibratedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "_DeviceProjects_AB_unique" ON "_DeviceProjects"("A", "B");

-- CreateIndex
CREATE INDEX "_DeviceProjects_B_index" ON "_DeviceProjects"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_DeviceToExperiment_AB_unique" ON "_DeviceToExperiment"("A", "B");

-- CreateIndex
CREATE INDEX "_DeviceToExperiment_B_index" ON "_DeviceToExperiment"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HardwareProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceProjects" ADD CONSTRAINT "_DeviceProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceProjects" ADD CONSTRAINT "_DeviceProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceToExperiment" ADD CONSTRAINT "_DeviceToExperiment_A_fkey" FOREIGN KEY ("A") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceToExperiment" ADD CONSTRAINT "_DeviceToExperiment_B_fkey" FOREIGN KEY ("B") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

