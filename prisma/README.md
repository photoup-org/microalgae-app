# This app owns its schema

`schema.prisma` here is the single owner of **this app's own database**, which runs
on the Pi. `prisma migrate` runs from this repo.

This used to be a read-only mirror of `app-gui/prisma/schema.prisma`, with both
apps pointing at one Neon instance. That ended when the reactor database moved onto
the Pi: the Pi is not publicly reachable, so a shared database would have taken
`app-gui` down with it. The two are now separate — `app-gui` keeps Neon and its own
schema, and nothing in this repo touches it.

## Rules

1. `npm run migrate` to create a migration, `npm run migrate:deploy` to apply one.
   The baseline is `migrations/0_init`, generated from the schema as it stood at the
   split.
2. `app-gui` is no longer upstream. Do not re-sync anything from it, and do not
   assume a column exists here because it exists there.
3. The Pi is the primary. The cloud instance reads the same database over the
   tailnet, so a migration applied from a laptop applies to production — there is no
   separate staging database.
4. **Check `DATABASE_URL` before migrating.** Until the cutover is finished, a
   `.env` left pointing at the old Neon instance would run `0_init` against
   `app-gui`'s database. It would fail on the first existing table rather than do
   damage, but it has no business being attempted.

## Moving the data

`scripts/copy-department.ts` copies one department out of the old shared Neon
database into a fresh one here, preserving ids (they appear in InfluxDB tags and in
the edge worker's device map, so regenerating them would orphan every existing
series). Run it once, after `migrate:deploy` has created the tables:

```
SOURCE_DATABASE_URL=<neon> TARGET_DATABASE_URL=<pi> DEPARTMENT_ID=<id> npm run copy-department
```

## The read-only cloud mirror

The Pi being primary means the cloud console dies with the Pi. `MIRROR_DATABASE_URL`
(cloud instance only) softens that: a second database holds a full copy, refreshed
by POSTing to `/api/mirror/sync` on a schedule.

Reads fail over to it automatically — `lib/core/prisma.ts` extends the client so an
unreachable primary retries the same query against the mirror. **Writes never fail
over.** A mutation against a copy would be discarded on the next sync, and a valve
command would report success without reaching the reactor, so writes throw instead.
`MirrorBanner` states how old the copy is, because a silent stand-in is worse than
an error page.

The mirror is never written to except by the sync. That is what keeps this safe
where bidirectional sync would not be: one writer, so no merge policy to get wrong.

## What this schema carries, and what it never did

Carried: `User`, `Project`, `Experiment`, `Device`, `HardwareProduct`,
`CalibrationRecord`, `SystemLog`, `PushSubscription`.

Never carried: every commercial model (`Organization`, `Department`, `PlanTier`,
`Order`, `OrderItem`, `Address`, `ProjectMember`) plus `Alert` and `SensorReading`.
Those live only in `app-gui`'s database now.

**Device ↔ Project is many-to-many** (`@relation("DeviceProjects")`, join table
`_DeviceProjects`). A reactor can sit in several projects at once; the old
single `Device.projectId` column was dropped in app-gui migration
`20260822100000_device_projects_many_to_many`, which backfills the join table
before dropping it. Exclusivity is enforced per **run**, not per project:
`createExperimentAction` refuses any device already attached to a
PLANNED/RUNNING/PAUSED experiment, so two projects can list the same reactor but
can never drive it at the same time.

**`CalibrationRecord.metric`** names the channel a calibration
applied to — `"ph"`, `"turbidity"`. It is nullable only for rows written before
the column existed; every new record sets it. `Device.lastCalibrated` /
`calibrationDueDate` stay device-level and cannot distinguish channels, so any
per-sensor calibration view must read the records, not those two columns — see
`lib/calibration-rows.ts`.

Two consequences worth knowing:

- **`Department` is not a model.** `User.departmentId`, `Project.departmentId` and
  `Device.departmentId` are plain scalar columns, and since the split there is no
  `Department` table behind them at all — no foreign key, nothing to point at. The
  id in `DEPARTMENT_ID` is just the label this deployment stamps on its rows.
- **`SensorReading` is not a model.** Telemetry does not live in Postgres. The edge
  worker writes it to InfluxDB under measurement `sensor_reading`; read it through
  `lib/db/influx.ts`.

## Field subsets

`HardwareProduct` and `User` declare fewer columns than `app-gui`'s versions do.
That used to be a hazard — inserting into a table whose real NOT NULL columns were
invisible to Prisma. Owning the database removes it: these tables now have exactly
the columns declared here.

## Naming

`Project` is presented to users as a **Reactor**. `Experiment` is an implementation
detail that never appears in the UI — see the note on the model.
