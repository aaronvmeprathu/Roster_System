export const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getMonthDates = (month) => {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1, 1);
  const dates = [];

  while (date.getMonth() === monthIndex - 1) {
    dates.push(formatDateKey(date));
    date.setDate(date.getDate() + 1);
  }

  return dates;
};
