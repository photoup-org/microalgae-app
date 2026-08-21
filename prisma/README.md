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
`CalibrationRecord`, `SystemLog` (read-only - see the note on the model).

Deliberately omitted: every commercial model (`Organization`, `Department`,
`PlanTier`, `Order`, `OrderItem`, `Address`, `ProjectMember`) plus `Alert`
and `SensorReading`.

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
