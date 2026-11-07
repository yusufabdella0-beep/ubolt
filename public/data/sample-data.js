/*
 * Sample data for the Branch Performance dashboard.
 *
 * Each record is one branch for one month. Replace this file, or use
 * "Import CSV" in the app, to show real figures. A CSV needs these columns:
 *
 *   month,code,name,region,deposits,deposits_target,loans,loans_target,
 *   customers,customers_target,digital,digital_target
 *
 * - month: YYYY-MM
 * - deposits / loans: balance at the end of the month
 * - customers / digital: new customers / new digital users during the month
 */
window.APP_CONFIG = {
  title: "Branch Performance",
  currency: "ETB",
};

window.SAMPLE_DATA = (function () {
  // Deterministic pseudo-random generator so the sample looks the same on every load.
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const regions = {
    "North": ["Bahir Dar", "Gondar", "Debre Markos", "Woldia", "Dessie", "Debre Tabor"],
    "South": ["Hawassa", "Arba Minch", "Dilla", "Wolaita Sodo", "Hosaena"],
    "East": ["Dire Dawa", "Harar", "Jigjiga", "Adama", "Awash"],
    "West": ["Jimma", "Nekemte", "Gambela", "Mizan", "Ambo"],
    "Central": ["Bole", "Piassa", "Merkato", "Kazanchis", "Megenagna", "Sarbet", "CMC"],
  };

  const months = [];
  const start = new Date(2026, 0, 1);
  for (let i = 0; i < 10; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }

  const rows = [];
  let n = 1;
  Object.entries(regions).forEach(([region, names]) => {
    names.forEach((name) => {
      const code = "BR" + String(n++).padStart(3, "0");
      const size = region === "Central" ? 2.2 : 0.6 + rand() * 1.2;
      const skill = 0.8 + rand() * 0.4; // how well this branch tends to hit target
      let deposits = 180e6 * size;
      let loans = 110e6 * size;
      months.forEach((month, i) => {
        const depTarget = 180e6 * size * (1 + 0.025 * (i + 1));
        const loanTarget = 110e6 * size * (1 + 0.02 * (i + 1));
        deposits = depTarget * (skill + (rand() - 0.5) * 0.12);
        loans = loanTarget * (skill + (rand() - 0.5) * 0.15);
        const custTarget = Math.round(320 * size);
        const digTarget = Math.round(540 * size);
        rows.push({
          month, code, name, region,
          deposits: Math.round(deposits),
          deposits_target: Math.round(depTarget),
          loans: Math.round(loans),
          loans_target: Math.round(loanTarget),
          customers: Math.round(custTarget * (skill + (rand() - 0.5) * 0.3)),
          customers_target: custTarget,
          digital: Math.round(digTarget * (skill + 0.05 + (rand() - 0.5) * 0.35)),
          digital_target: digTarget,
        });
      });
    });
  });
  return rows;
})();
