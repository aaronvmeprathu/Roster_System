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

  // Night Team: 1 female senior, 1 male senior, 1 female junior, 1 male junior (Total 4)
  teams.night.push(...takeNightShiftWorkers(femaleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(femaleJuniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleJuniors, 1));

  // Morning Team: 5 members (exactly 2 female seniors, 2 male seniors, 1 junior)
  teams.morning.push(...takeFromPool(femaleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "female" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "female" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(femaleSeniors, needed));
  }

  teams.morning.push(...takeFromPool(maleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "male" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "male" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(maleSeniors, needed));
  }

  const remainingJuniors = sortByName([...femaleJuniors, ...maleJuniors]);
  teams.morning.push(...takeFromPool(remainingJuniors, 1, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.level === "junior").length < 1) {
    const needed = 1 - teams.morning.filter(e => e.level === "junior").length;
    teams.morning.push(...takeFromPool(remainingJuniors, needed));
  }

  // Evening Team: remaining 5 members (1 female senior, 1 male senior, 3 juniors)
  teams.evening.push(...femaleSeniors);
  teams.evening.push(...maleSeniors);
  teams.evening.push(...remainingJuniors);

  return teams;
};

const CYCLE_ANCHOR_DATE = "2026-01-01";
const SHIFT_KEYS = ["morning", "evening", "night"];
const SHIFT_MINIMUMS = { morning: 3, evening: 3, night: 2 };

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
  const actualPartitions = [];

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

    actualPartitions.push({
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

  const evaluate = (offsets) => {
    let failures = 0;

    for (let idx = 0; idx < actualPartitions.length; idx++) {
      const part = actualPartitions[idx];
      const monthStart = `${part.month}-01`;
      const prevMonth = addMonths(monthStart, -1);
      const prevMonthDates = getMonthDates(prevMonth.slice(0, 7));
      const lastTwoDatesOfPrevMonth = prevMonthDates.slice(-2);

      const transitionEmployees = new Set();
      if (prevMonth >= CYCLE_ANCHOR_DATE && lastTwoDatesOfPrevMonth.length === 2) {
        part.simEmployees.forEach((emp) => {
          if (part.workedNightShiftLastMonth(emp)) {
            const offset = offsets[emp.employeeId] ?? 0;
            const workedBoth = lastTwoDatesOfPrevMonth.every((date) => {
              const absoluteDayIndex = daysSinceAnchor(date);
              const cycleDay = (absoluteDayIndex + offset) % 7;
              return cycleDay < 5;
            });
            if (workedBoth) {
              transitionEmployees.add(emp.employeeId);
            }
          }
        });
      }

      const activeNightStretches = new Set(transitionEmployees);

      for (const date of part.dates) {
        const absoluteDayIndex = daysSinceAnchor(date);
        const dateObj = new Date(`${date}T00:00:00Z`);
        const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;
        const requiredMin = isWeekend ? 2 : 3;
        const nightRequiredMin = SHIFT_MINIMUMS.night;
        
        const isOff = (empId) => {
          const offset = offsets[empId] ?? 0;
          return (absoluteDayIndex + offset) % 7 >= 5;
        };

        for (const empId of activeNightStretches) {
          if (isOff(empId)) {
            activeNightStretches.delete(empId);
          }
        }

        for (const shiftKey of SHIFT_KEYS) {
          const members = part.simEmployees.filter((employee) => {
            const isTransitioning = activeNightStretches.has(employee.employeeId);
            const effectiveShift = isTransitioning ? "night" : (
              part.teams.night.some(m => m.employeeId === employee.employeeId) ? "night" : (
                part.teams.morning.some(m => m.employeeId === employee.employeeId) ? "morning" : "evening"
              )
            );
            return effectiveShift === shiftKey;
          });

          const assigned = members.filter(emp => !isOff(emp.employeeId));

          const minimumForShift = shiftKey === "night" ? nightRequiredMin : requiredMin;
          if (assigned.length < minimumForShift) failures++;
          if (!assigned.some(emp => emp.level === "senior")) failures++;
          if (shiftKey === "night") {
            const femaleCount = assigned.filter(emp => emp.gender === "female").length;
            if (femaleCount === 1) failures++;
          }
        }
      }
    }

    return failures;
  };

  const allEmployeesList = employees14.map(e => e.employeeId);
  let bestScore = Infinity;
  let bestOffsets = null;

  console.log("Searching for optimal 14-employee offsets...");
  for (let restart = 0; restart < 500; restart++) {
    const current = {};
    for (const empId of allEmployeesList) {
      current[empId] = Math.floor(Math.random() * 7);
    }

    let score = evaluate(current);
    if (score === 0) {
      bestScore = 0;
      bestOffsets = current;
      break;
    }

    let improved = true;
    let steps = 0;
    while (improved && steps < 1000) {
      improved = false;
      steps++;

      for (const empId of allEmployeesList) {
        const originalVal = current[empId];
        let bestNewVal = originalVal;
        let bestNewScore = score;
        
        for (let newVal = 0; newVal < 7; newVal++) {
          if (newVal === originalVal) continue;
          current[empId] = newVal;
          const newScore = evaluate(current);
          if (newScore < bestNewScore) {
            bestNewScore = newScore;
            bestNewVal = newVal;
          }
        }
        current[empId] = bestNewVal;
        if (bestNewScore < score) {
          score = bestNewScore;
          improved = true;
        }
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestOffsets = { ...current };
    }
    if (bestScore === 0) {
      break;
    }
  }

  if (bestScore === 0) {
    console.log("FOUND VALID 14-EMPLOYEE CONFIGURATION!");
    console.log(JSON.stringify(bestOffsets, null, 2));
  } else {
    console.log("Failed to find valid offsets. Best score:", bestScore);
  }
};

runSearch();
