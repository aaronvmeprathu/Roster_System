import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectDatabase, getEmployees, getLeaves, saveEmployeeLeave, seedEmployees, updateEmployeeNightBlocks } from "./services/store.js";
import { generateSchedule } from "./utils/scheduler.js";

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const useDatabase = await connectDatabase();
await seedEmployees(useDatabase);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: useDatabase ? "mongodb" : "memory" });
});

app.get("/api/employees", async (_req, res) => {
  const employees = await getEmployees(useDatabase);
  res.json(employees);
});

app.get("/api/leaves", async (_req, res) => {
  const leaves = await getLeaves(useDatabase);
  res.json(leaves);
});

app.get("/api/schedule", async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ message: "Month is required in YYYY-MM format." });
    }

    const employees = await getEmployees(useDatabase);
    const leaves = await getLeaves(useDatabase);
    const schedule = generateSchedule({ employees, month, leaves });

    const nightTeamIds = schedule.teams.night;
    const monthStart = `${month}-01`;
    await updateEmployeeNightBlocks(employees, nightTeamIds, monthStart, useDatabase);

    return res.json(schedule);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/api/leaves", async (req, res) => {
  try {
    const { employeeId, dates, month } = req.body;
    if (!employeeId || !Array.isArray(dates)) {
      return res.status(400).json({ message: "employeeId and dates are required." });
    }

    await saveEmployeeLeave({ employeeId, dates }, useDatabase);
    const employees = await getEmployees(useDatabase);
    const leaves = await getLeaves(useDatabase);
    const schedule = generateSchedule({ employees, month, leaves });

    const nightTeamIds = schedule.teams.night;
    const monthStart = `${month}-01`;
    await updateEmployeeNightBlocks(employees, nightTeamIds, monthStart, useDatabase);

    return res.json(schedule);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
