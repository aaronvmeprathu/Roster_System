import { employeeSeed } from "./src/data/employees.js";
import { formatDateString, addMonths } from "./src/utils/scheduler.js";
import { getMonthDates } from "./src/utils/date.js";

const sortByName = (employees) => [...employees].sort((left, right) => left.name.localeCompare(right.name));

const employees14 = employeeSeed;

const createShiftTeams14 = (employees, monthStart, prevEveningTeamIds = null) => {
  const femaleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "female"));
  const maleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "male"));
  const femaleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "female"));
  const maleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "male"));

  const nightBlocked = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const blockLimitStr = addMonths(monthStart, 2);
    return blockedStr && blockedStr >= monthStart && blockedStr < blockLimitStr;
  };

  const workedEveningLastMonth = (employee) => {
    if (!prevEveningTeamIds) return false;
    return prevEveningTeamIds.includes(employee.employeeId);
  };

  const teams = {
    morning: [],
    evening: [],
    night: []
  };

  const takeFromPool = (pool, count, predicate = () => true) => {
    const chosen = [];
    for (let index = 0; index < pool.length && chosen.length < count; ) {
      if (predicate(pool[index])) {
        chosen.push(pool[index]);
        pool.splice(index, 1);
      } else {
        index += 1;
      }
    }
    return chosen;
  };

  const takeNightShiftWorkers = (pool, count) => {
    const sortedPool = [...pool].sort((left, right) => {
      const leftBlocked = nightBlocked(left);
      const rightBlocked = nightBlocked(right);

      if (leftBlocked !== rightBlocked) {
        return leftBlocked ? 1 : -1;
      }

      if (leftBlocked) {
        const leftDate = left.nightShiftBlockedUntil ? new Date(left.nightShiftBlockedUntil).getTime() : 0;
        const rightDate = right.nightShiftBlockedUntil ? new Date(right.nightShiftBlockedUntil).getTime() : 0;
        if (leftDate !== rightDate) {
          return leftDate - rightDate;
        }
      }

      return left.name.localeCompare(right.name);
    });

    const chosen = [];
    for (const emp of sortedPool) {
      if (chosen.length >= count) break;
      if (!nightBlocked(emp) && !workedEveningLastMonth(emp)) {
        chosen.push(emp);
        const idx = pool.findIndex((e) => e.employeeId === emp.employeeId);
        if (idx !== -1) pool.splice(idx, 1);
      }
    }

    if (chosen.length < count) {
      const remainingNeeded = count - chosen.length;
      const fallbackPool = sortedPool.filter((emp) => !chosen.some((c) => c.employeeId === emp.employeeId));
      const fallbackChosen = fallbackPool.slice(0, remainingNeeded);
      fallbackChosen.forEach((emp) => {
        chosen.push(emp);
        const idx = pool.findIndex((e) => e.employeeId === emp.employeeId);
        if (idx !== -1) pool.splice(idx, 1);
      });
    }

    return chosen;
  };

  const workedNightShiftLastMonth = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const lastMonthBlockStr = addMonths(monthStart, 1);
    return blockedStr && blockedStr === lastMonthBlockStr;
  };

  // Night Team: 1 female senior, 1 male senior, 1 female junior, 2 male juniors (Total 5)
  teams.night.push(...takeNightShiftWorkers(femaleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(femaleJuniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleJuniors, 2));

  // Morning Team: 4 members (exactly 2 female seniors, 1 male senior, 1 junior)
  teams.morning.push(...takeFromPool(femaleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "female" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "female" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(femaleSeniors, needed));
  }

  teams.morning.push(...takeFromPool(maleSeniors, 1, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "male" && e.level === "senior").length < 1) {
    const needed = 1 - teams.morning.filter(e => e.gender === "male" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(maleSeniors, needed));
  }

  const remainingJuniors = sortByName([...femaleJuniors, ...maleJuniors]);
  teams.morning.push(...takeFromPool(remainingJuniors, 1, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.level === "junior").length < 1) {
    const needed = 1 - teams.morning.filter(e => e.level === "junior").length;
    teams.morning.push(...takeFromPool(remainingJuniors, needed));
  }

  // Evening Team: remaining 5 members (1 female senior, 2 male seniors, 2 juniors)
  teams.evening.push(...femaleSeniors);
  teams.evening.push(...maleSeniors);
  teams.evening.push(...remainingJuniors);

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

  // Precompute and optimize partitions for evaluate loop
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
        isFemale: emp.gender === "female",
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

  const evaluate = (offsets) => {
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
        let nightCount = 0, nightSeniors = 0, nightFemales = 0;

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
            if (emp.isFemale) nightFemales++;
          }
        }

        if (morningCount < requiredMin) failures++;
        if (eveningCount < requiredMin) failures++;
        if (nightCount < requiredMin) failures++;

        if (morningSeniors < 1) failures++;
        if (eveningSeniors < 1) failures++;
        if (nightSeniors < 1) failures++;

        if (nightFemales === 1) failures++;
      }
    }

    return failures;
  };

  const allEmployeesList = employees14.map(e => e.employeeId);
  let bestScore = Infinity;
  let bestOffsets = null;

  console.log("Starting optimized search for 6F/8M pool (4/5/5)...");
  const t0 = Date.now();
  
  for (let restart = 0; restart < 5000; restart++) {
    const current = new Array(14);
    for (let i = 0; i < 14; i++) {
      current[i] = Math.floor(Math.random() * 7);
    }

    let score = evaluate(current);
    if (score === 0) {
      bestScore = 0;
      bestOffsets = current;
      break;
    }

    let improved = true;
    let steps = 0;
    while (improved && steps < 100) {
      improved = false;
      steps++;

      for (let i = 0; i < 14; i++) {
        const originalVal = current[i];
        let bestNewVal = originalVal;
        let bestNewScore = score;
        
        for (let newVal = 0; newVal < 7; newVal++) {
          if (newVal === originalVal) continue;
          current[i] = newVal;
          const newScore = evaluate(current);
          if (newScore < bestNewScore) {
            bestNewScore = newScore;
            bestNewVal = newVal;
          }
        }
        current[i] = bestNewVal;
        if (bestNewScore < score) {
          score = bestNewScore;
          improved = true;
        }
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestOffsets = [...current];
      console.log(`Restart ${restart}: new best score = ${bestScore}`);
    }
    if (bestScore === 0) {
      break;
    }
  }

  const duration = Date.now() - t0;
  console.log(`Search completed in ${duration}ms.`);

  if (bestScore === 0) {
    console.log("FOUND VALID 14-EMPLOYEE CONFIGURATION!");
    const offsetMap = {};
    employees14.forEach((emp, i) => {
      offsetMap[emp.employeeId] = bestOffsets[i];
    });
    console.log(JSON.stringify(offsetMap, null, 2));
  } else {
    console.log("Failed to find valid offsets. Best score:", bestScore);
  }
};

runSearch();
