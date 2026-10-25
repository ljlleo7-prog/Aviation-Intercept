export function formatDailyApiUsage(plan, now = Date.now()) {
  if (!plan || !Number.isFinite(plan.used) || plan.used < 0 || !Number.isFinite(plan.limit) || plan.limit <= 0
    || !Number.isFinite(Date.parse(plan.resetsAt)) || Date.parse(plan.resetsAt) <= now) {
    return { label: '—% daily', title: 'Daily API credit usage unavailable. Sign in to view your usage. Guest weather is free and rate-limited.', exhausted: false };
  }
  const percentage = plan.used / plan.limit * 100;
  // Do not round to 100% before the last permitted credit has been used.
  const formatted = (Math.floor(percentage * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return {
    label: `${formatted}% daily`,
    title: `${plan.used.toLocaleString()} / ${plan.limit.toLocaleString()} daily API credits used. Resets at ${new Date(plan.resetsAt).toISOString()}. No tokens deducted now.`,
    exhausted: plan.used >= plan.limit
  };
}
