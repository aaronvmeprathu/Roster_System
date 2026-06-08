import { getMonthDates } from "./date.js";

const SHIFT_KEYS = ["morning", "evening", "night"];
const CYCLE_ANCHOR_DATE = "2026-01-01";
const SHIFT_MINIMUMS = {
  morning: 3,
  evening: 3,
  night: 2
};

export const formatDateString = (dateOrString) => {
  if (!dateOrString) return null;
  if (dateOrString instanceof Date) {
    const year = dateOrString.getUTCFullYear();
    const month = `${dateOrString.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${dateOrString.getUTCDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return typeof dateOrString === "string" ? dateOrString.slice(0, 10) : dateOrString;
};

export const addMonths = (dateString, months) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  const rYear = date.getUTCFullYear();
  const rMonth = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const rDay = `${date.getUTCDate()}`.padStart(2, "0");
  return `${rYear}-${rMonth}-${rDay}`;
};

const buildLeaveLookup = (leaveEntries) => {
  const map = new Map();
  leaveEntries.forEach((entry) => {
    map.set(entry.employeeId, new Set(entry.dates));
  });
  return map;
};

const daysSinceAnchor = (dateString, anchorString = CYCLE_ANCHOR_DATE) => {
  const current = new Date(`${dateString}T00:00:00Z`);
  const anchor = new Date(`${anchorString}T00:00:00Z`);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((current - anchor) / millisecondsPerDay);
};

const sortByName = (employees) => [...employees].sort((left, right) => left.name.localeCompare(right.name));

const createShiftTeams = (employees, monthStart, prevEveningTeamIds = null) => {
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

  // 1. Assign Night Team for a 14-employee roster
  teams.night.push(...takeNightShiftWorkers(femaleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleSeniors, 1));
  teams.night.push(...takeNightShiftWorkers(femaleJuniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleJuniors, 1));

  if (teams.night.length < 4) {
    throw new Error("Unable to create a fixed night-shift team that satisfies the female and night-block rules.");
  }

  // 2. Assign Morning Team for a 14-employee roster: 2 female seniors, 2 male seniors, 1 junior
  teams.morning.push(...takeFromPool(femaleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "female").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "female").length;
    teams.morning.push(...takeFromPool(femaleSeniors, needed));
  }

  teams.morning.push(...takeFromPool(maleSeniors, 2, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.gender === "male" && e.level === "senior").length < 2) {
    const needed = 2 - teams.morning.filter(e => e.gender === "male" && e.level === "senior").length;
    teams.morning.push(...takeFromPool(maleSeniors, needed));
  }

  // Morning Team juniors: 1 junior
  const remainingJuniors = sortByName([...femaleJuniors, ...maleJuniors]);
  teams.morning.push(...takeFromPool(remainingJuniors, 1, (employee) => !workedNightShiftLastMonth(employee)));
  if (teams.morning.filter(e => e.level === "junior").length < 1) {
    const needed = 1 - teams.morning.filter(e => e.level === "junior").length;
    teams.morning.push(...takeFromPool(remainingJuniors, needed));
  }

  // 3. Assign Evening Team
  teams.evening.push(...femaleSeniors);
  teams.evening.push(...maleSeniors);
  teams.evening.push(...remainingJuniors);

  const allAssigned = [...teams.morning, ...teams.evening, ...teams.night];
  if (allAssigned.length !== employees.length) {
    throw new Error("Unable to create fixed monthly shift teams for all employees.");
  }

  Object.keys(teams).forEach((shiftKey) => {
    const seniorCount = teams[shiftKey].filter((employee) => employee.level === "senior").length;
    if (seniorCount < 1) {
      throw new Error(`Shift team ${shiftKey} does not have a senior employee.`);
    }
  });

  const nightFemaleCount = teams.night.filter((employee) => employee.gender === "female").length;
  if (nightFemaleCount === 1) {
    throw new Error("Night shift team cannot include exactly 1 female employee (must be 0, or 2 or more).");
  }

  const nightMaleCount = teams.night.filter((employee) => employee.gender === "male").length;
  if (nightMaleCount < 1) {
    throw new Error("Night shift team must include at least one male employee.");
  }

  return teams;
};

const createWeeklyPatterns = () =>
  new Map([
    ["EMP001", 6],
    ["EMP002", 1],
    ["EMP003", 5],
    ["EMP004", 3],
    ["EMP005", 3],
    ["EMP006", 1],
    ["EMP007", 5],
    ["EMP008", 1],
    ["EMP014", 3],
    ["EMP015", 1],
    ["EMP016", 4],
    ["EMP017", 1],
    ["EMP018", 6],
    ["EMP019", 1]
  ]);

const buildOffMap = (monthDates, employees, weeklyPatterns) =>
  monthDates.reduce((acc, date) => {
    const offSet = new Set();
    const absoluteDayIndex = daysSinceAnchor(date);

    employees.forEach((employee) => {
      const offset = weeklyPatterns.get(employee.employeeId) ?? 0;
      const cycleDay = (absoluteDayIndex + offset) % 7;
      if (cycleDay >= 5) {
        offSet.add(employee.employeeId);
      }
    });

    acc[date] = offSet;
    return acc;
  }, {});

const getShiftAvailability = ({ members, date, offSet, leaveLookup }) =>
  members.filter(
    (employee) =>
      !offSet.has(employee.employeeId) &&
      !leaveLookup.get(employee.employeeId)?.has(date)
  );

const ensureShiftCoverage = ({ shiftKey, assigned, minimum }) => {
  if (assigned.length < minimum) {
    throw new Error(`Unable to fill ${shiftKey} shift on the selected date with fixed monthly teams.`);
  }

  if (!assigned.some((employee) => employee.level === "senior")) {
    throw new Error(`No senior available for ${shiftKey} shift on the selected date.`);
  }

  if (shiftKey === "night") {
    const femaleCount = assigned.filter((employee) => employee.gender === "female").length;
    if (femaleCount === 1) {
      throw new Error("Night shift cannot have exactly 1 female employee working (must be 0, or 2 or more).");
    }
  }

  return assigned;
};

export const generateSchedule = ({ employees, month, leaves = [] }) => {
  const monthDates = getMonthDates(month);
  const monthStart = `${month}-01`;
  const leaveLookup = buildLeaveLookup(leaves);

  // Chronologically simulate team generation and block states up to the target month
  const simulatedEmployees = employees.map(emp => ({
    ...emp,
    nightShiftBlockedUntil: null
  }));

  const historicalEveningTeams = new Map();
  let currentSimMonth = "2026-01";

  while (currentSimMonth < month) {
    const currentSimMonthStart = `${currentSimMonth}-01`;
    const prevMonthOfSim = addMonths(currentSimMonthStart, -1).slice(0, 7);
    const prevEveningIds = historicalEveningTeams.get(prevMonthOfSim);
    
    const simTeams = createShiftTeams(simulatedEmployees, currentSimMonthStart, prevEveningIds);
    const nightTeamIds = simTeams.night.map(e => e.employeeId);
    historicalEveningTeams.set(currentSimMonth, simTeams.evening.map(e => e.employeeId));

    const blockDateStr = addMonths(currentSimMonthStart, 2);
    simulatedEmployees.forEach(emp => {
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

  // Now generate the actual shift teams using the simulated employees and lookup
  const prevMonthStr = addMonths(monthStart, -1).slice(0, 7);
  const prevEveningIds = historicalEveningTeams.get(prevMonthStr);
  const shiftTeams = createShiftTeams(simulatedEmployees, monthStart, prevEveningIds);

  const weeklyPatterns = createWeeklyPatterns();
  const hasLeaves = leaves.length > 0;
  const offMap = buildOffMap(monthDates, simulatedEmployees, weeklyPatterns);

  const workedDays = new Map(simulatedEmployees.map((employee) => [employee.employeeId, 0]));
  const nightAssignments = new Map(simulatedEmployees.map((employee) => [employee.employeeId, 0]));

  const fixedShiftByEmployee = new Map(
    simulatedEmployees.map((employee) => [
      employee.employeeId,
      SHIFT_KEYS.find((shiftKey) =>
        shiftTeams[shiftKey].some((member) => member.employeeId === employee.employeeId)
      )
    ])
  );

  const workedNightShiftLastMonth = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const lastMonthBlockStr = addMonths(monthStart, 1);
    return blockedStr && blockedStr === lastMonthBlockStr;
  };

  const nightTransitionDays = new Map();
  const prevMonth = addMonths(monthStart, -1);
  const prevMonthDates = getMonthDates(prevMonth.slice(0, 7));
  const lastTwoDatesOfPrevMonth = prevMonthDates.slice(-2);

  if (prevMonth >= CYCLE_ANCHOR_DATE && lastTwoDatesOfPrevMonth.length === 2) {
    simulatedEmployees.forEach((employee) => {
      if (!workedNightShiftLastMonth(employee)) {
        return;
      }

      const offset = weeklyPatterns.get(employee.employeeId) ?? 0;
      const workedBothEndDays = lastTwoDatesOfPrevMonth.every((date) => {
        const cycleDay = (daysSinceAnchor(date) + offset) % 7;
        const isOff = cycleDay >= 5;
        const isLeave = leaveLookup.get(employee.employeeId)?.has(date);
        return !isOff && !isLeave;
      });

      if (workedBothEndDays) {
        nightTransitionDays.set(employee.employeeId, 2);
      }
    });
  }

  const dailySchedule = monthDates.map((date) => {
    const offSet = offMap[date];

    const schedule = {
      date,
      shifts: {},
      off: simulatedEmployees.filter((employee) => offSet.has(employee.employeeId)).map((employee) => employee.employeeId),
      leave: simulatedEmployees
        .filter((employee) => leaveLookup.get(employee.employeeId)?.has(date))
        .map((employee) => employee.employeeId)
    };

    const rosters = Object.fromEntries(SHIFT_KEYS.map((shiftKey) => [shiftKey, []]));

    simulatedEmployees.forEach((employee) => {
      const isOff = offSet.has(employee.employeeId);
      const isLeave = leaveLookup.get(employee.employeeId)?.has(date);

      if (nightTransitionDays.has(employee.employeeId) && (isOff || isLeave)) {
        nightTransitionDays.delete(employee.employeeId);
      }

      if (isOff || isLeave) {
        return;
      }

      const completedNightDays = nightTransitionDays.get(employee.employeeId) ?? 0;
      const isContinuingNight = completedNightDays > 0 && completedNightDays < 5;
      const effectiveShift = isContinuingNight ? "night" : fixedShiftByEmployee.get(employee.employeeId);

      rosters[effectiveShift].push(employee);
    });

    SHIFT_KEYS.forEach((shiftKey) => {
      if (hasLeaves) {
        schedule.shifts[shiftKey] = ensureShiftCoverage({
          shiftKey,
          assigned: rosters[shiftKey],
          minimum: SHIFT_MINIMUMS[shiftKey]
        });
      } else {
        schedule.shifts[shiftKey] = rosters[shiftKey];
      }

      schedule.shifts[shiftKey].forEach((employee) => {
        workedDays.set(employee.employeeId, workedDays.get(employee.employeeId) + 1);
        if (shiftKey === "night") {
          nightAssignments.set(employee.employeeId, nightAssignments.get(employee.employeeId) + 1);

          const completedNightDays = nightTransitionDays.get(employee.employeeId);
          if (completedNightDays > 0 && completedNightDays < 5) {
            nightTransitionDays.set(employee.employeeId, completedNightDays + 1);
          }
        }
      });
    });

    return schedule;
  });

  const nightTeamIds = shiftTeams.night.map((employee) => employee.employeeId);
  const blockDateStr = addMonths(monthStart, 2);
  simulatedEmployees.forEach((employee) => {
    const isAssignedToNight = nightTeamIds.includes(employee.employeeId);
    const currentBlockStr = formatDateString(employee.nightShiftBlockedUntil);

    if (isAssignedToNight) {
      if (currentBlockStr !== blockDateStr) {
        employee.nightShiftBlockedUntil = blockDateStr;
      }
    } else if (currentBlockStr === blockDateStr) {
      employee.nightShiftBlockedUntil = null;
    }
  });

  return {
    month,
    shifts: ["Morning", "Evening", "Night"],
    teams: Object.fromEntries(
      SHIFT_KEYS.map((shiftKey) => [
        shiftKey,
        shiftTeams[shiftKey].map((employee) => employee.employeeId)
      ])
    ),
    summary: simulatedEmployees.map((employee) => {
      const shiftKey = SHIFT_KEYS.find((key) =>
        shiftTeams[key].some((member) => member.employeeId === employee.employeeId)
      );

      return {
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        level: employee.level,
        gender: employee.gender,
        fixedShift: shiftKey,
        workedDays: workedDays.get(employee.employeeId),
        nightAssignments: nightAssignments.get(employee.employeeId),
        nextNightEligibleMonth: shiftKey === "night" ? addMonths(monthStart, 2) : formatDateString(employee.nightShiftBlockedUntil)
      };
    }),
    simulatedEmployees: simulatedEmployees.map((employee) => ({
      employeeId: employee.employeeId,
      nightShiftBlockedUntil: employee.nightShiftBlockedUntil
    })),
    dailySchedule
  };
};
