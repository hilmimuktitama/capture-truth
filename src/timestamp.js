const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/;

export function isValidTimestamp(value) {
  if (typeof value !== "string") return false;

  const match = RFC3339.exec(value.trim());
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , zone, offsetHour, offsetMinute] = match;
  return Number(month) >= 1
    && Number(month) <= 12
    && Number(day) >= 1
    && Number(day) <= daysInMonth(Number(year), Number(month))
    && Number(hour) < 24
    && Number(minute) < 60
    && Number(second) < 60
    && (zone === "Z" || (Number(offsetHour) < 24 && Number(offsetMinute) < 60));
}

export function normalizeTimestamp(value) {
  if (!isValidTimestamp(value)) return value;

  const trimmed = value.trim();
  const match = RFC3339.exec(trimmed);
  if (match[8].toUpperCase() === "Z") {
    return `${trimmed.slice(0, -1).replace(/[tT]/, "T")}Z`;
  }

  const [, year, month, day, hour, minute, second, fraction, zone, offsetHour, offsetMinute] = match;
  const milliseconds = civilTime(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Math.floor(Number(`0.${fraction ?? "0"}`) * 1000)
  );
  const offset = (Number(offsetHour) * 60 + Number(offsetMinute)) * 60000;
  const utcMilliseconds = milliseconds + (zone[0] === "+" ? -offset : offset);
  return new Date(utcMilliseconds).toISOString();
}

export function validClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid capture clock.");
  return date;
}

function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function civilTime(year, month, day, hour, minute, second, milliseconds) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthPrime = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;
  return (era * 146097 + dayOfEra - 719468) * 86400000
    + hour * 3600000
    + minute * 60000
    + second * 1000
    + milliseconds;
}
