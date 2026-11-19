/**
 * Local-calendar date helpers.
 *
 * Dates are handled as plain `YYYY-MM-DD` strings so they never shift a day
 * because of UTC conversion. "Today" is always read from the user's local
 * system clock at the moment it is requested.
 */

export function getTodayISO() {
  return toISODate(new Date());
}

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(value) {
  if (!isValidISODate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function addDaysISO(value, days) {
  const date = parseISODate(value);
  if (!date) return value;
  date.setDate(date.getDate() + Number(days || 0));
  return toISODate(date);
}

export function firstOfMonthISO(value) {
  const date = parseISODate(value);
  if (!date) return `${getTodayISO().slice(0, 7)}-01`;
  date.setDate(1);
  return toISODate(date);
}

export function shiftMonthISO(firstOfMonth, delta) {
  const date = parseISODate(firstOfMonth);
  if (!date) return firstOfMonth;
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(delta || 0));
  return toISODate(date);
}

export function formatLongDate(value) {
  const date = parseISODate(value);
  if (!date) return value || '';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthYear(value) {
  const date = parseISODate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function daysBetweenISO(start, end) {
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);
  if (!startDate || !endDate) return 0;
  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}
