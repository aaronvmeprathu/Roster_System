import { employeeSeed } from "./src/data/employees.js";
import { generateSchedule } from "./src/utils/scheduler.js";

const months = Array.from({ length: 12 }, (_, index) => `2026-${`${index + 1}`.padStart(2, "0")}`);

const scoreOffsets = (offsets) => {
  let failures = 0;
  for (const month of months) {
    try {
      generateSchedule({ employees: employeeSeed, month, weeklyOffsets: offsets });
    } catch {
      failures += 1;
    }
  }
  return failures;
};

const hillClimb = (start) => {
  const current = { ...start };
  let score = scoreOffsets(current);

  let improved = true;
  while (improved) {
    improved = false;
    for (const employee of employeeSeed) {
      const original = current[employee.employeeId];
      let bestVal = original;
      let bestScore = score;

      for (let offset = 0; offset < 7; offset += 1) {
        if (offset === original) continue;
        current[employee.employeeId] = offset;
        const nextScore = scoreOffsets(current);
        if (nextScore < bestScore) {
          bestScore = nextScore;
          bestVal = offset;
        }
      }

      current[employee.employeeId] = bestVal;
      if (bestScore < score) {
        score = bestScore;
        improved = true;
      }
    }
  }

  return { offsets: current, score };
};

let bestScore = Infinity;
let bestOffsets = null;

for (let restart = 0; restart < 500; restart += 1) {
  const random = Object.fromEntries(
    employeeSeed.map((employee) => [employee.employeeId, Math.floor(Math.random() * 7)])
  );
  const result = hillClimb(random);
  if (result.score < bestScore) {
    bestScore = result.score;
    bestOffsets = result.offsets;
    console.log(`Restart ${restart}: best month failures = ${bestScore}`);
  }
  if (bestScore === 0) break;
}

console.log("Final score:", bestScore);
console.log(JSON.stringify(bestOffsets, null, 2));
