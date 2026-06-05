# Employee Schedule and Leave Management System

MERN-based workforce scheduling app for a 20-person engineering team.

## Included

- 20 seeded employees
- 13 senior developers and 7 junior developers
- male and female employee distribution
- 3 daily shifts: morning, evening, night
- monthly schedule generation
- leave marking with automatic schedule regeneration
- responsive React dashboard UI

## Scheduling rules implemented

- every shift gets at least 3 members
- every shift gets at least 1 senior
- once an employee is assigned to Morning, Evening, or Night, that shift stays fixed for the whole month
- night shift is generated with at least 2 female employees
- employees are rotated in a continuous 5-working-day and 2-day-off pattern across months
- employees who already had a night-shift month are blocked from night assignment until 2 months later

## Important note on leave handling

The scheduler now keeps the `5 consecutive working days + 2 consecutive off days` rule strict. If leave makes a day impossible to staff while also preserving all constraints, schedule regeneration returns a validation error instead of breaking the shift pattern.

## Run

```bash
npm install
npm run dev
```

Backend: `http://localhost:5000`

Frontend: `http://localhost:5173`

## MongoDB

By default the app can run in memory.

To use MongoDB:

1. Copy `server/.env.example` to `server/.env`
2. Set `MONGODB_URI`
3. Restart the server
