// This assists a drying session, not verification of the appliance. Require
// sustained airflow, or corroborating motor AND airflow evidence, before counting.
// Once confirmed, weaker airflow/motor windows may continue the session. Wind,
// silence and unrelated sounds never earn time; a two-second gap resets it.
export function createDryerDetector() {
  let active = false, gap = 0, pending = [];
  return (categories, rms, seconds) => {
    const score = name => Math.max(0, ...categories.filter(c => c.categoryName === name).map(c => c.score));
    const anchor = score('Hair dryer') >= .1;
    const airflow = score('Hiss') >= .25 && score('Steam') >= .25;
    const motor = score('Drill') >= .3 || score('Mechanical fan') >= .3;
    const softAirflow = score('Hiss') >= .03 && score('Steam') >= .03;
    const competing = score('Speech') >= .3 || score('Music') >= .3;
    const evidence = anchor || airflow || motor || (active && softAirflow);
    if (rms < .005 || competing || !evidence) {
      gap += seconds;
      if (gap >= 2 || competing) { active = false; pending = []; }
      return 0;
    }
    gap = 0;
    if (active) return seconds;
    pending.push({seconds,airflow,motor});
    // Motor-only time cannot build up indefinitely before an unrelated noise.
    while (pending.reduce((sum,p)=>sum+p.seconds,0)>6) pending.shift();
    const airSeconds = pending.reduce((sum,p)=>sum+(p.airflow?p.seconds:0),0);
    const motorSeconds = pending.reduce((sum,p)=>sum+(p.motor?p.seconds:0),0);
    if (!anchor && airSeconds < 3 && !(airSeconds >= 1.5 && motorSeconds >= .9)) return 0;
    active = true;
    const confirmed = pending.reduce((sum,p)=>sum+p.seconds,0); pending = [];
    return confirmed;
  };
}
