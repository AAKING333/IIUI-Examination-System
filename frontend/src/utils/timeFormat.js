/**
 * Time formatting utilities for 12-hour AM/PM clock display across the application.
 */

/**
 * Formats a single time string (e.g. "08:45", "14:30", "14:30:00") into 12-hour AM/PM format ("08:45 AM", "02:30 PM").
 * @param {string|number} timeStr
 * @returns {string}
 */
export function formatTime12(timeStr) {
  if (!timeStr) return '';
  const trimmed = String(timeStr).trim();
  // Already in AM/PM format
  if (/am|pm/i.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  if (isNaN(hours)) return trimmed;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
  return `${formattedHours}:${minutes} ${ampm}`;
}

/**
 * Formats start and end times into a clean 12-hour AM/PM range string.
 * Supports passing (start, end) or a single combined string like "08:45 - 10:15".
 * @param {string} startTime
 * @param {string} [endTime]
 * @returns {string} e.g. "08:45 AM – 10:15 AM"
 */
export function formatTimeRange12(startTime, endTime) {
  if (!startTime && !endTime) return '';

  // If only 1 argument provided and it contains a dash, split it
  if (!endTime && typeof startTime === 'string') {
    const parts = startTime.split(/\s*[-–—]\s*/);
    if (parts.length === 2) {
      return `${formatTime12(parts[0])} – ${formatTime12(parts[1])}`;
    }
    return formatTime12(startTime);
  }

  if (!startTime) return formatTime12(endTime);
  if (!endTime) return formatTime12(startTime);

  return `${formatTime12(startTime)} – ${formatTime12(endTime)}`;
}

/**
 * Formats slot time range from a slot object.
 * @param {{ start_time?: string, end_time?: string }} slot
 * @returns {string} e.g. "08:45 AM – 10:15 AM"
 */
export function formatSlotTime(slot) {
  if (!slot) return '';
  return formatTimeRange12(slot.start_time, slot.end_time);
}

/**
 * Formats date and slot time range, e.g. "2026-10-26 (08:45 AM – 10:15 AM)"
 * @param {{ date?: string, start_time?: string, end_time?: string }} slot
 * @returns {string}
 */
export function formatDateAndSlotTime(slot) {
  if (!slot) return '';
  const time = formatSlotTime(slot);
  return time ? `${slot.date || ''} (${time})` : slot.date || '';
}
