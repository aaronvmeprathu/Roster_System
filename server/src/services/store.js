import mongoose from "mongoose";
import { employeeSeed } from "../data/employees.js";
import { Employee } from "../models/Employee.js";
import { Leave } from "../models/Leave.js";
import { addMonths, formatDateString } from "../utils/scheduler.js";

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
  if (!useDatabase) return employeeSeed;
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

export const updateEmployeeNightBlocks = async (employees, nightTeamIds, monthStart, useDatabase) => {
  const blockDateStr = addMonths(monthStart, 2);
  const blockDate = useDatabase ? new Date(blockDateStr) : blockDateStr;

  const updates = [];
  employees.forEach((employee) => {
    const isAssignedToNight = nightTeamIds.includes(employee.employeeId);
    const currentBlock = employee.nightShiftBlockedUntil;
    const currentBlockStr = formatDateString(currentBlock);

    if (isAssignedToNight) {
      if (currentBlockStr !== blockDateStr) {
        updates.push({ employeeId: employee.employeeId, nightShiftBlockedUntil: blockDate });
      }
    } else {
      if (currentBlockStr === blockDateStr) {
        updates.push({ employeeId: employee.employeeId, nightShiftBlockedUntil: null });
      }
    }
  });

  if (updates.length === 0) return;

  if (!useDatabase) {
    updates.forEach(({ employeeId, nightShiftBlockedUntil }) => {
      const employee = employeeSeed.find((emp) => emp.employeeId === employeeId);
      if (employee) {
        employee.nightShiftBlockedUntil = nightShiftBlockedUntil;
      }
    });
    return;
  }

  for (const { employeeId, nightShiftBlockedUntil } of updates) {
    await Employee.findOneAndUpdate(
      { employeeId },
      { nightShiftBlockedUntil }
    );
  }
};
