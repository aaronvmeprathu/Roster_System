import { employeeSeed } from "./src/data/employees.js";
import { formatDateString, addMonths } from "./src/utils/scheduler.js";
import { getMonthDates } from "./src/utils/date.js";

const sortByName = (employees) => [...employees].sort((left, right) => left.name.localeCompare(right.name));

const employees14 = employeeSeed.map(emp => ({ ...emp, gender: "male" }));

const createShiftTeams14 = (employees, monthStart, prevEveningTeamIds = null) => {
  const seniors = sortByName(employees.filter((employee) => employee.level === "senior"));
  const juniors = sortByName(employees.filter((employee) => employee.level === "junior"));

  const workedNightShiftLastMonth = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const lastMonthBlockStr = addMonths(monthStart, 1);
    return blockedStr && blockedStr === lastMonthBlockStr;
  };

  const teams = { morning: [], evening: [], night: [] };

  // Night Team (4): 2 seniors, 2 juniors (prefer those who did NOT work night last month)
  const sortedSeniors = [...seniors].sort((a, b) => {
    const aNight = workedNightShiftLastMonth(a);
    const bNight = workedNightShiftLastMonth(b);
    return aNight === bNight ? a.name.localeCompare(b.name) : (aNight ? 1 : -1);
  });
  teams.night.push(...sortedSeniors.slice(0, 2));

  const sortedJuniors = [...juniors].sort((a, b) => {
    const aNight = workedNightShiftLastMonth(a);
    const bNight = workedNightShiftLastMonth(b);
    return aNight === bNight ? a.name.localeCompare(b.name) : (aNight ? 1 : -1);
  });
  teams.night.push(...sortedJuniors.slice(0, 2));

  // Evening Team (6): 3 seniors, 3 juniors (prefer those who worked night last month)
  const remainingSeniors = seniors.filter(e => !teams.night.includes(e));
  const sortedRemainingSeniors = [...remainingSeniors].sort((a, b) => {
    const aNight = workedNightShiftLastMonth(a);
    const bNight = workedNightShiftLastMonth(b);
    return aNight === bNight ? a.name.localeCompare(b.name) : (aNight ? -1 : 1);
  });
  teams.evening.push(...sortedRemainingSeniors.slice(0, 3));

  const remainingJuniors = juniors.filter(e => !teams.night.includes(e));
  const sortedRemainingJuniors = [...remainingJuniors].sort((a, b) => {
    const aNight = workedNightShiftLastMonth(a);
    const bNight = workedNightShiftLastMonth(b);
    return aNight === bNight ? a.name.localeCompare(b.name) : (aNight ? -1 : 1);
  });
  teams.evening.push(...sortedRemainingJuniors.slice(0, 3));

  // Morning Team (4): remaining 3 seniors and 1 junior
  teams.morning.push(...remainingSeniors.filter(e => !teams.evening.includes(e)));
  teams.morning.push(...remainingJuniors.filter(e => !teams.evening.includes(e)));

  return teams;
};

const CYCLE_ANCHOR_DATE = "2026-01-01";
const SHIFT_KEYS = ["morning", "evening", "night"];

const daysSinceAnchor = (dateString, anchorString = CYCLE_ANCHOR_DATE) => {
  const current = new Date(`${dateString}T00:00:00Z`);
  const anchor = new Date(`${anchorString}T00:00:00Z`);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((current - anchor) / millisecondsPerDay);
};

const runSearch = async () => {
  const months = [];
  let currentMonth = "2026-06";
  for (let index = 0; index < 24; index++) {
    months.push(currentMonth);
    currentMonth = addMonths(`${currentMonth}-01`, 1).slice(0, 7);
  }

  const historicalEveningTeams = new Map();
  const rawPartitions = [];

  for (let idx = 0; idx < months.length; idx++) {
    const month = months[idx];
    const monthStart = `${month}-01`;
    
    const simEmployees = employees14.map(emp => ({ ...emp, nightShiftBlockedUntil: null }));
    let currentSimMonth = "2026-01";
    
    while (currentSimMonth < month) {
      const currentSimMonthStart = `${currentSimMonth}-01`;
      const prevMonthOfSim = addMonths(currentSimMonthStart, -1).slice(0, 7);
      const prevEveningIds = historicalEveningTeams.get(prevMonthOfSim);
      
      const teams = createShiftTeams14(simEmployees, currentSimMonthStart, prevEveningIds);
      const nightTeamIds = teams.night.map(e => e.employeeId);
      
      const blockDateStr = addMonths(currentSimMonthStart, 2);
      simEmployees.forEach(emp => {
        const isAssignedToNight = nightTeamIds.includes(emp.employeeId);
        const currentBlock = emp.nightShiftBlockedUntil;
        const currentBlockStr = formatDateString(currentBlock);

        if (isAssignedToNight) {
          if (currentBlockStr !== blockDateStr) {
            emp.nightShiftBlockedUntil = blockDateStr;
          }
        } else {
          if (currentBlockStr === blockDateStr) {
            emp.nightShiftBlockedUntil = null;
          }
        }
      });

      currentSimMonth = addMonths(currentSimMonthStart, 1).slice(0, 7);
    }
    
    const prevMonthStr = addMonths(monthStart, -1).slice(0, 7);
    const prevEveningIds = historicalEveningTeams.get(prevMonthStr);
    
    const actualTeams = createShiftTeams14(simEmployees, monthStart, prevEveningIds);
    historicalEveningTeams.set(month, actualTeams.evening.map(e => e.employeeId));

    rawPartitions.push({
      month,
      dates: getMonthDates(month),
      teams: actualTeams,
      workedNightShiftLastMonth: (employee) => {
        const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
        const lastMonthBlockStr = addMonths(monthStart, 1);
        return blockedStr && blockedStr === lastMonthBlockStr;
      },
      simEmployees
    });
  }

  const employeeIdToIndexMap = new Map();
  employees14.forEach((emp, i) => {
    employeeIdToIndexMap.set(emp.employeeId, i);
  });

  const partitions = rawPartitions.map(part => {
    const monthStart = `${part.month}-01`;
    const prevMonth = addMonths(monthStart, -1);
    const prevMonthDates = getMonthDates(prevMonth.slice(0, 7));
    const lastTwoDatesOfPrevMonth = prevMonthDates.slice(-2);

    const lastTwoDatesAbsoluteIndices = lastTwoDatesOfPrevMonth.map(d => daysSinceAnchor(d));
    const isPrevMonthValid = prevMonth >= CYCLE_ANCHOR_DATE && lastTwoDatesAbsoluteIndices.length === 2;

    const datesInfo = part.dates.map(date => {
      const absoluteDayIndex = daysSinceAnchor(date);
      const dateObj = new Date(`${date}T00:00:00Z`);
      const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;
      return { absoluteDayIndex, isWeekend };
    });

    const simEmployeesOptimized = part.simEmployees.map(emp => {
      const idx = employeeIdToIndexMap.get(emp.employeeId);
      
      let defaultShift = 1; // evening
      if (part.teams.night.some(m => m.employeeId === emp.employeeId)) {
        defaultShift = 2; // night
      } else if (part.teams.morning.some(m => m.employeeId === emp.employeeId)) {
        defaultShift = 0; // morning
      }

      return {
        idx,
        employeeId: emp.employeeId,
        isSenior: emp.level === "senior",
        workedNightShiftLastMonth: part.workedNightShiftLastMonth(emp),
        defaultShift
      };
    });

    simEmployeesOptimized.sort((a, b) => a.idx - b.idx);

    return {
      month: part.month,
      datesInfo,
      lastTwoDatesAbsoluteIndices,
      isPrevMonthValid,
      simEmployees: simEmployeesOptimized
    };
  });

  const evaluate = (offsets, print = false) => {
    let failures = 0;

    for (let idx = 0; idx < partitions.length; idx++) {
      const part = partitions[idx];
      const activeNightStretches = new Array(14).fill(false);

      if (part.isPrevMonthValid) {
        const lastTwo0 = part.lastTwoDatesAbsoluteIndices[0];
        const lastTwo1 = part.lastTwoDatesAbsoluteIndices[1];
        
        for (let i = 0; i < 14; i++) {
          const emp = part.simEmployees[i];
          if (emp.workedNightShiftLastMonth) {
            const offset = offsets[i];
            const workedBoth = ((lastTwo0 + offset) % 7 < 5) && ((lastTwo1 + offset) % 7 < 5);
            if (workedBoth) {
              activeNightStretches[i] = true;
            }
          }
        }
      }

      for (let d = 0; d < part.datesInfo.length; d++) {
        const dateInfo = part.datesInfo[d];
        const absIdx = dateInfo.absoluteDayIndex;
        const requiredMin = dateInfo.isWeekend ? 2 : 3;

        // Check if transition stretch has ended
        for (let i = 0; i < 14; i++) {
          if (activeNightStretches[i]) {
            const offset = offsets[i];
            if ((absIdx + offset) % 7 >= 5) {
              activeNightStretches[i] = false;
            }
          }
        }

        let morningCount = 0, morningSeniors = 0;
        let eveningCount = 0, eveningSeniors = 0;
        let nightCount = 0, nightSeniors = 0;

        for (let i = 0; i < 14; i++) {
          const emp = part.simEmployees[i];
          const offset = offsets[i];
          const isOff = (absIdx + offset) % 7 >= 5;
          if (isOff) continue;

          const isTransitioning = activeNightStretches[i];
          const shift = isTransitioning ? 2 : emp.defaultShift;

          if (shift === 0) {
            morningCount++;
            if (emp.isSenior) morningSeniors++;
          } else if (shift === 1) {
            eveningCount++;
            if (emp.isSenior) eveningSeniors++;
          } else {
            nightCount++;
            if (emp.isSenior) nightSeniors++;
          }
        }

        if (morningCount < requiredMin) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Morning has only ${morningCount} working (needed ${requiredMin})`);
        }
        if (eveningCount < requiredMin) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Evening has only ${eveningCount} working (needed ${requiredMin})`);
        }
        if (nightCount < requiredMin) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Night has only ${nightCount} working (needed ${requiredMin})`);
        }

        if (morningSeniors < 1) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Morning has 0 seniors`);
        }
        if (eveningSeniors < 1) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Evening has 0 seniors`);
        }
        if (nightSeniors < 1) {
          failures++;
          if (print) console.log(`Violation: [${part.month}-${d+1}] Night has 0 seniors`);
        }
      }
    }

    return failures;
  };

  const maleAllowedOffsets = [0, 1, 2, 3, 4, 5, 6];

  let overallBestEnergy = Infinity;
  let overallBestOffsets = null;

  console.log("Starting Simulated Annealing search for 14-male pool...");
  const t0 = Date.now();

  for (let restart = 0; restart < 15; restart++) {
    let current = new Array(14);
    for (let i = 0; i < 14; i++) {
      current[i] = maleAllowedOffsets[Math.floor(Math.random() * maleAllowedOffsets.length)];
    }

    let currentEnergy = evaluate(current);
    let bestOffsets = [...current];
    let bestEnergy = currentEnergy;

    let T = 100.0;
    const coolingRate = 0.99998;
    let iterations = 0;

    while (T > 0.001 && bestEnergy > 0) {
      iterations++;
      const neighbor = [...current];
      let idxToMutate = Math.floor(Math.random() * 14);

      let newVal;
      do {
        newVal = maleAllowedOffsets[Math.floor(Math.random() * maleAllowedOffsets.length)];
      } while (newVal === neighbor[idxToMutate]);

      neighbor[idxToMutate] = newVal;

      const neighborEnergy = evaluate(neighbor);
      
      if (neighborEnergy < currentEnergy) {
        current = neighbor;
        currentEnergy = neighborEnergy;
        if (currentEnergy < bestEnergy) {
          bestEnergy = currentEnergy;
          bestOffsets = [...current];
        }
      } else {
        const diff = neighborEnergy - currentEnergy;
        const prob = Math.exp(-diff / T);
        if (Math.random() < prob) {
          current = neighbor;
          currentEnergy = neighborEnergy;
        }
      }

      T *= coolingRate;
    }

    console.log(`Restart ${restart} completed. Best energy = ${bestEnergy}`);

    if (bestEnergy < overallBestEnergy) {
      overallBestEnergy = bestEnergy;
      overallBestOffsets = [...bestOffsets];
    }

    if (overallBestEnergy === 0) {
      break;
    }
  }

  const duration = Date.now() - t0;
  console.log(`Search completed in ${duration}ms.`);

  if (overallBestEnergy === 0) {
    console.log("FOUND VALID 14-EMPLOYEE CONFIGURATION!");
    const offsetMap = {};
    employees14.forEach((emp, i) => {
      offsetMap[emp.employeeId] = overallBestOffsets[i];
    });
    console.log(JSON.stringify(offsetMap, null, 2));
  } else {
    console.log("Failed to find valid offsets. Best energy:", overallBestEnergy);
    console.log("Best offsets:", overallBestOffsets);
    evaluate(overallBestOffsets, true);
  }
};

runSearch();
