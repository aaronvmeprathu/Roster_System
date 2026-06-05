import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    dates: [{ type: String, required: true }]
  },
  { timestamps: true }
);

export const Leave = mongoose.model("Leave", leaveSchema);
