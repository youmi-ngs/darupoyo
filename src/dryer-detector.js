// YAMNet often labels dryer airflow as Steam/Hiss. Accept dryer evidence, or
// confirm several seconds of joint airflow evidence before crediting those seconds.
// This is a drying-flow aid, not proof of which appliance produced the sound:
// similar continuous steam-like noise can qualify. Volume alone is insufficient.
// Calibrated against a real-device recording, kept outside the repository.
export function createDryerDetector() {
  let active = false, gap = 0, pending = 0;
  return (categories, rms, seconds) => {
    const score = name => Math.max(0, ...categories.filter(c => c.categoryName === name).map(c => c.score));
    const audible = rms >= .005;
    const anchor = score('Hair dryer') >= .1;
    const airflow = score('Hiss') >= .25 && score('Steam') >= .25;
    const competing = score('Speech') >= .3 || score('Music') >= .3;
    if (!audible || competing || (!anchor && !airflow)) {
      gap += seconds;
      // Do not count interruptions. A pause ends the association with earlier sound.
      if (gap >= 2 || competing) { active = false; pending = 0; }
      return 0;
    }
    gap = 0;
    if (active) return seconds;
    pending += seconds;
    if (!anchor && pending < 3) return 0;
    active = true;
    const confirmed = pending; pending = 0;
    return confirmed;
  };
}
