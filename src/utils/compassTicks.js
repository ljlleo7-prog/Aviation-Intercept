export const compassTicks = heading => Array.from({ length: 36 }, (_, index) => {
  const bearing = index * 10;
  const normalizedHeading = ((heading % 360) + 360) % 360;
  const offset = ((bearing - normalizedHeading + 540) % 360) - 180;
  return { bearing, offset, label: String(index).padStart(2, '0') };
}).filter(tick => Math.abs(tick.offset) <= 78);
