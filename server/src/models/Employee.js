import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    level: { type: String, enum: ["senior", "junior"], required: true },
    role: { type: String, required: true },
    nightShiftBlockedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Employee = mongoose.model("Employee", employeeSchema);
