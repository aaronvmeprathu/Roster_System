import { formatDateKey, getMonthDates } from "./date.js";

const SHIFT_KEYS = ["morning", "evening", "night"];
const CYCLE_ANCHOR_DATE = "2026-01-01";

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

const createShiftTeams = (employees, monthStart) => {
  const femaleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "female"));
  const maleSeniors = sortByName(employees.filter((employee) => employee.level === "senior" && employee.gender === "male"));
  const femaleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "female"));
  const maleJuniors = sortByName(employees.filter((employee) => employee.level === "junior" && employee.gender === "male"));

  const nightBlocked = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const blockLimitStr = addMonths(monthStart, 2);
    return blockedStr && blockedStr >= monthStart && blockedStr < blockLimitStr;
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

  const seniorPools = [femaleSeniors, maleSeniors];
  const juniorPools = [femaleJuniors, maleJuniors];
  const allPools = [femaleSeniors, maleSeniors, femaleJuniors, maleJuniors];

  const takeAny = (count, pools, predicate = () => true) => {
    const chosen = [];
    for (const pool of pools) {
      if (chosen.length >= count) break;
      chosen.push(...takeFromPool(pool, count - chosen.length, predicate));
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

    const chosen = sortedPool.slice(0, count);
    chosen.forEach((emp) => {
      const idx = pool.findIndex((e) => e.employeeId === emp.employeeId);
      if (idx !== -1) pool.splice(idx, 1);
    });
    return chosen;
  };

  const workedNightShiftLastMonth = (employee) => {
    const blockedStr = formatDateString(employee.nightShiftBlockedUntil);
    const lastMonthBlockStr = addMonths(monthStart, 1);
    return blockedStr && blockedStr === lastMonthBlockStr;
  };

  teams.night.push(...takeNightShiftWorkers(femaleSeniors, 2));
  teams.night.push(...takeNightShiftWorkers(maleSeniors, 2));
  teams.night.push(...takeNightShiftWorkers(femaleJuniors, 1));
  teams.night.push(...takeNightShiftWorkers(maleJuniors, 1));

  if (teams.night.length < 6) {
    throw new Error("Unable to create a fixed night-shift team that satisfies the female and night-block rules.");
  }

  teams.morning.push(...takeAny(4, seniorPools, (employee) => !workedNightShiftLastMonth(employee)));
  teams.morning.push(...takeAny(3, juniorPools, (employee) => !workedNightShiftLastMonth(employee)));

  teams.evening.push(...takeAny(5, seniorPools));
  teams.evening.push(...takeAny(2, juniorPools));

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
  if (nightMaleCount < 3) {
    throw new Error("Night shift team must include a mix of male and female employees.");
  }

  return teams;
};

const createWeeklyPatterns = (employees) => {
  const patternMap = new Map([
    ["EMP001", 5],
    ["EMP002", 2],
    ["EMP003", 3],
    ["EMP004", 1],
    ["EMP005", 6],
    ["EMP006", 6],
    ["EMP007", 4],
    ["EMP008", 5],
    ["EMP009", 5],
    ["EMP010", 4],
    ["EMP011", 0],
    ["EMP012", 3],
    ["EMP013", 2],
    ["EMP014", 1],
    ["EMP015", 0],
    ["EMP016", 4],
    ["EMP017", 1],
    ["EMP018", 2],
    ["EMP019", 4],
    ["EMP020", 3]
  ]);
  return patternMap;
};

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

const ensureShiftCoverage = ({ shiftKey, assigned, minimum, requireFemaleNight }) => {
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
  const shiftTeams = createShiftTeams(employees, monthStart);
  const weeklyPatterns = createWeeklyPatterns(employees);
  const offMap = buildOffMap(monthDates, employees, weeklyPatterns);

  const workedDays = new Map(employees.map((employee) => [employee.employeeId, 0]));
  const nightAssignments = new Map(employees.map((employee) => [employee.employeeId, 0]));

  const dailySchedule = monthDates.map((date) => {
    const offSet = offMap[date];
    const schedule = {
      date,
      shifts: {},
      off: employees.filter((employee) => offSet.has(employee.employeeId)).map((employee) => employee.employeeId),
      leave: employees
        .filter((employee) => leaveLookup.get(employee.employeeId)?.has(date))
        .map((employee) => employee.employeeId),
      offAdjusted: []
    };

    const nightFemaleTeamCount = shiftTeams.night.filter((employee) => employee.gender === "female").length;

    SHIFT_KEYS.forEach((shiftKey) => {
      const members = shiftTeams[shiftKey];
      const assigned = getShiftAvailability({ members, date, offSet, leaveLookup });
      const roster = ensureShiftCoverage({
        shiftKey,
        assigned,
        minimum: 3,
        requireFemaleNight: shiftKey === "night" ? nightFemaleTeamCount : 0
      });

      schedule.shifts[shiftKey] = roster;

      roster.forEach((employee) => {
        workedDays.set(employee.employeeId, workedDays.get(employee.employeeId) + 1);
        if (shiftKey === "night") {
          nightAssignments.set(employee.employeeId, nightAssignments.get(employee.employeeId) + 1);
        }
      });
    });
    return schedule;
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
    summary: employees.map((employee) => {
      const shiftKey = SHIFT_KEYS.find((key) =>
        shiftTeams[key].some((member) => member.employeeId === employee.employeeId)
      );

      return {
        employeeId: employee.employeeId,
        name: employee.name,
        level: employee.level,
        gender: employee.gender,
        fixedShift: shiftKey,
        workedDays: workedDays.get(employee.employeeId),
        nightAssignments: nightAssignments.get(employee.employeeId),
        nextNightEligibleMonth: shiftKey === "night" ? addMonths(monthStart, 2) : formatDateString(employee.nightShiftBlockedUntil)
      };
    }),
    dailySchedule
  };
};
