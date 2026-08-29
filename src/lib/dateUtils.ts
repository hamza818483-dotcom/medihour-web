export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // +6 hours in milliseconds

export const toDhakaTimeISO = (isoString: string | null): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  // Add 6 hours to UTC time to get Dhaka time components
  const dhakaTime = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return dhakaTime.toISOString().slice(0, 16);
};

export const fromDhakaTimeToUTC = (localString: string): string | null => {
  if (!localString) return null;
  // Treat input as if it were UTC, then subtract 6 hours
  const date = new Date(localString + "Z"); // Append Z to treat as UTC
  if (isNaN(date.getTime())) return null;
  const utcTime = new Date(date.getTime() - DHAKA_OFFSET_MS);
  return utcTime.toISOString();
};
