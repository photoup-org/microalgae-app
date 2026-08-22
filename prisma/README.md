# This schema is a read-only mirror

`schema.prisma` here is a **hand-maintained subset** of
`app-gui/prisma/schema.prisma`, which is the single owner of the database schema.

## Rules

1. **Never run `prisma migrate` from this app.** There is deliberately no migrate
   script in `package.json`. Only `prisma generate`.
2. When `app-gui`'s schema changes in a way that touches the models below,
   re-sync this file by hand. Nothing detects the drift for you.
3. Do not add models just because they exist upstream. Add one only when this app
   actually reads or writes it.

## What is mirrored, and what was left out

Mirrored: `User`, `Project`, `Experiment`, `Device`, `HardwareProduct`,
`CalibrationRecord`, `SystemLog` (written here too now, via `app/api/system-logs` -
see the note on the model).

Deliberately omitted: every commercial model (`Organization`, `Department`,
`PlanTier`, `Order`, `OrderItem`, `Address`, `ProjectMember`) plus `Alert`
and `SensorReading`.

**Device ↔ Project is many-to-many** (`@relation("DeviceProjects")`, join table
`_DeviceProjects`). A reactor can sit in several projects at once; the old
single `Device.projectId` column was dropped in app-gui migration
`20260822100000_device_projects_many_to_many`, which backfills the join table
before dropping it. Exclusivity is enforced per **run**, not per project:
`createExperimentAction` refuses any device already attached to a
PLANNED/RUNNING/PAUSED experiment, so two projects can list the same reactor but
can never drive it at the same time.

**`CalibrationRecord.metric`** (added in app-gui migration
`20260822120000_calibration_record_metric`) names the channel a calibration
applied to — `"ph"`, `"turbidity"`. It is nullable only for rows written before
the column existed; every new record sets it. `Device.lastCalibrated` /
`calibrationDueDate` stay device-level and cannot distinguish channels, so any
per-sensor calibration view must read the records, not those two columns — see
`lib/calibration-rows.ts`.

Two consequences worth knowing:

- **`Department` is not a model.** `User.departmentId`, `Project.departmentId` and
  `Device.departmentId` are plain scalar columns here. Postgres still enforces the
  foreign key, so the id in `DEPARTMENT_ID` must reference a real row.
- **`SensorReading` is not a model.** Telemetry does not live in Postgres. The edge
  worker writes it to InfluxDB under measurement `sensor_reading`; read it through
  `lib/db/influx.ts`.

## Field subsets

Some mirrored models declare only the columns this app uses — `HardwareProduct` and
`User` most notably. That is safe **only because this app never creates rows in
them**. If that ever changes, the missing NOT NULL columns will cause runtime insert
failures that Prisma cannot warn you about at generate time.

## Naming

`Project` is presented to users as a **Reactor**. `Experiment` is an implementation
detail that never appears in the UI — see the note on the model.
