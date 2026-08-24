# This app owns its schema

`schema.prisma` here is the single owner of **this app's own database**, a Neon
instance separate from `app-gui`'s. `prisma migrate` runs from this repo.

This used to be a read-only mirror of `app-gui/prisma/schema.prisma`, with both
apps sharing one database. Splitting them removed the hand-maintained drift that
`prisma migrate` could not see. `app-gui` keeps `neondb` and its own schema, and
nothing in this repo touches it.

## Rules

1. `npm run migrate` to create a migration, `npm run migrate:deploy` to apply one.
   The baseline is `migrations/0_init`, generated from the schema as it stood at the
   split.
2. `app-gui` is no longer upstream. Do not re-sync anything from it, and do not
   assume a column exists here because it exists there.
3. The cloud database is the primary and the only writer. A migration applied from
   a laptop applies to production — there is no separate staging database.
4. **Apply every migration to the Pi's replica too.** It is built from this same
   schema, and a replica missing a column fails only once the cloud goes down —
   which is the worst possible moment to discover it.

## Moving the data

`scripts/copy-department.ts` copies one department out of the old shared database
into a fresh one, preserving ids (they appear in InfluxDB tags and in the edge
worker's device map, so regenerating them would orphan every existing series). Run
it once, after `migrate:deploy` has created the tables:

```
SOURCE_DATABASE_URL=<old shared> TARGET_DATABASE_URL=<new> DEPARTMENT_ID=<id> npm run copy-department
```

## The Pi's local replica, and offline writes

The cloud is the single writer, so the LAN console on the Pi would normally die
with the internet. `MIRROR_DATABASE_URL` (**LAN instance only**) points at a
Postgres on the Pi holding a full copy, refreshed by POSTing to `/api/mirror/sync`
on a schedule.

`lib/core/prisma.ts` extends the client so an unreachable cloud is handled without
any call site knowing:

- **Reads** are served from the replica.
- **Writes** are queued in `OutboxEntry` *and* applied to the replica, so the UI
  reflects them immediately.

Queueing a write is safe only because the reactor has already been told by the time
we get there: `setValveAction` and `updateExperimentLifecycleAction` publish over
MQTT to the *local* broker first — which works offline — and touch the database
afterwards. The queued row records a command that already happened.

Replay is conflict-free because both of those actions refuse when the edge does not
answer, so the cloud cannot move a reactor's state while the Pi is away. Pure
metadata edits (renaming a project) are the exception, and resolve last-write-wins.

**Order matters in `/api/mirror/sync`: drain the outbox, then refresh.**
`refreshMirror` is a full delete-and-insert; refreshing with entries pending would
erase exactly the offline work this exists to protect. The route refuses to refresh
while anything is unapplied.

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
