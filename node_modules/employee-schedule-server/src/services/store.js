import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { employeeSeed } from "../data/employees.js";
import { Employee } from "../models/Employee.js";
import { Leave } from "../models/Leave.js";
import { formatDateString } from "../utils/scheduler.js";

let memoryLeaves = [];

export const connectDatabase = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return false;
  }

  try {
    await mongoose.connect(uri);
    return true;
  } catch (error) {
    console.warn("MongoDB unavailable, using in-memory store instead.");
    return false;
  }
};

export const seedEmployees = async (useDatabase) => {
  if (!useDatabase) return employeeSeed;

  const count = await Employee.countDocuments();
  if (count === 0) {
    await Employee.insertMany(employeeSeed);
  }

  return Employee.find().lean();
};

export const getEmployees = async (useDatabase) => {
  if (!useDatabase) {
    const filePath = path.join(process.cwd(), "blocks.json");
    if (fs.existsSync(filePath)) {
      try {
        const savedBlocks = JSON.parse(fs.readFileSync(filePath, "utf8"));
        employeeSeed.forEach((emp) => {
          if (savedBlocks[emp.employeeId] !== undefined) {
            emp.nightShiftBlockedUntil = savedBlocks[emp.employeeId];
          }
        });
      } catch (e) {
        console.error("Failed to read blocks.json", e);
      }
    }
    return employeeSeed;
  }
  return Employee.find().sort({ employeeId: 1 }).lean();
};

export const getLeaves = async (useDatabase) => {
  if (!useDatabase) return memoryLeaves;
  return Leave.find().lean();
};

export const saveEmployeeLeave = async ({ employeeId, dates }, useDatabase) => {
  if (!useDatabase) {
    memoryLeaves = memoryLeaves.filter((entry) => entry.employeeId !== employeeId);
    memoryLeaves.push({ employeeId, dates });
    return { employeeId, dates };
  }

  const updated = await Leave.findOneAndUpdate(
    { employeeId },
    { employeeId, dates },
    { new: true, upsert: true }
  ).lean();

  return updated;
};

export const syncEmployeeNightBlocks = async (simulatedEmployees, useDatabase) => {
  if (!useDatabase) {
    simulatedEmployees.forEach((simulatedEmployee) => {
      const employee = employeeSeed.find((emp) => emp.employeeId === simulatedEmployee.employeeId);
      if (employee) {
        employee.nightShiftBlockedUntil = simulatedEmployee.nightShiftBlockedUntil;
      }
    });

    const savedBlocks = {};
    employeeSeed.forEach((emp) => {
      savedBlocks[emp.employeeId] = emp.nightShiftBlockedUntil;
    });
    const filePath = path.join(process.cwd(), "blocks.json");
    try {
      fs.writeFileSync(filePath, JSON.stringify(savedBlocks, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to write blocks.json", e);
    }
    return;
  }

  for (const simulatedEmployee of simulatedEmployees) {
    const nightShiftBlockedUntil = simulatedEmployee.nightShiftBlockedUntil
      ? new Date(formatDateString(simulatedEmployee.nightShiftBlockedUntil))
      : null;

    await Employee.findOneAndUpdate(
      { employeeId: simulatedEmployee.employeeId },
      { nightShiftBlockedUntil }
    );
  }
};
