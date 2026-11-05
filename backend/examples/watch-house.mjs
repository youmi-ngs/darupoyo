// Use in a browser with Firebase JS SDK installed in the Frontend project.
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";

export function watchHouse(db, houseId, onChange, onError, timezone = "Asia/Tokyo") {
  let house = null;
  let dayState = null;
  let posts = [];
  let day = "";
  let stopDay = () => {};
  let stopped = false;
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  function emit() {
    if (!house || stopped) return;
    const lights = Object.fromEntries(house.member_ids.map(uid => [uid, Boolean(dayState?.completed?.[uid]?.length)]));
    onChange({ house, day, state: dayState, posts, lights,
      happiness: Math.round(100 * Object.values(lights).filter(Boolean).length / house.member_ids.length) });
  }
  function changeDay() {
    const parts = Object.fromEntries(dateFormatter.formatToParts(new Date()).map(p => [p.type, p.value]));
    const next = `${parts.year}-${parts.month}-${parts.day}`;
    if (next === day || stopped) return;
    stopDay();
    day = next;
    dayState = null;
    emit();
    stopDay = onSnapshot(doc(db, "houses", houseId, "days", day), snapshot => {
      dayState = snapshot.data() ?? null;
      emit();
    }, onError);
  }
  const stopHouse = onSnapshot(doc(db, "houses", houseId), snapshot => {
    house = snapshot.data() ?? null;
    emit();
  }, onError);
  const stopPosts = onSnapshot(query(collection(db, "houses", houseId, "posts"), orderBy("id", "desc"), limit(30)), snapshot => {
    posts = snapshot.docs.map(d => d.data());
    emit();
  }, onError);
  changeDay();
  const timer = setInterval(changeDay, 15000);
  window.addEventListener("focus", changeDay);
  document.addEventListener("visibilitychange", changeDay);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", changeDay);
    document.removeEventListener("visibilitychange", changeDay);
    stopDay(); stopHouse(); stopPosts();
  };
}
