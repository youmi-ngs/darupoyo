"""Phone notifications through Firebase Cloud Messaging (web push).

- A friend clears a chore: the other members hear about it in the gal voice they picked.
- 19:00 (Cloud Scheduler): members with nothing done today get a gentle, no-blame nudge.

Tokens live in notify/{uid}, which the browser cannot read (Firestore rules deny it).
Without Firebase (local/dev) messages are only recorded in `sent`, so tests can check them.
"""

import logging
import random

from . import gals
from .accounts import require_active

MAX_TOKENS = 5
GAL_CHOICES = (*gals.GALS, "random")

FRIEND_FALLBACK = {
    "heisei": ["{name}が{reward}ゲットしたらしいよ〜！ほめにいこ↑↑", "{name}、{chore}やったってチョー神じゃん！ほめよ〜"],
    "reiwa": ["{name}が{reward}手に入れたらしいよー。褒めよー。", "{name}、{chore}してて えぐ。ほめに行こ"],
    "kuro": ["{name}が{chore}やったって！ウチらでほめてやろ", "{name}が{reward}ゲット。やるじゃん、ほめにいこ"],
    "hime": ["{name}ちゃんが{reward}ゲットしたんだって♡ ほめてあげよ♡", "{name}ちゃん、{chore}えらいこ♡ いっしょにほめよ♡"],
}
EVENING_FALLBACK = {
    "heisei": ["今日はまだだけど、休みにしちゃう？？？ あたしはどっちでもアゲだし↑↑"],
    "reiwa": ["今日はまだやってないけど、休みにしちゃう？？？ それもありよりのあり"],
    "kuro": ["今日はまだだけど、休みにしちゃう？？？ 休むのも自分の機嫌とりっしょ"],
    "hime": ["今日はまだだけど、お休みにしちゃう？？？ 姫はどっちでも味方だよ♡"],
}
FRIEND_RULE = (
    "家の友だちが家事をしたことを、スマホの通知でユーザーに知らせる一言を書く。"
    "その友だちをいっしょにほめに行こうと誘う。40文字以内の1文。かぎかっこは付けない。"
)
# Notification titles say what happened; the phone already shows the app name, so
# a title of 「だるぽよ」 read as 「だるぽよ from だるぽよ」 (#143).
DONE = {"laundry": "洗濯した", "meal": "ごはんを食べた", "dryer": "髪を乾かした", "garbage": "ゴミを出した"}
EVENING_RULE = (
    "19時になっても、ユーザーは今日まだ家事をしていない。スマホの通知で声をかける一言を書く。"
    "責めない・急かさない。「今日は休みにしちゃう？」のように、休んでもいいと伝える。40文字以内の1文。かぎかっこは付けない。"
)


def voice(gal, rng=random):
    """The recipient's gal; 'random' (ノリで) picks one each time."""
    return gal if gal in gals.GALS else rng.choice(list(gals.GALS))


class Notifier:
    def __init__(self, settings, firebase_app=None, praise=None):
        self.settings = settings
        self.app = firebase_app
        self.praise = praise
        self.sent = []  # local/dev: what would have been sent

    # ---------- wording ----------
    def _gemini(self, gal, rule, contents, chore=None):
        client = getattr(self.praise, "client", None)
        if client is None:
            return None
        try:
            from google.genai import types

            sheet = gals.GALS[gal]
            # #145: meals follow the same wording rule as the praise (no cooking/eating-out guesses, no 「だるいのに」).
            meal = "\n" + gals.MEAL_RULE if chore == "meal" else ""
            system = f"{rule}{meal}\nあなたは「{sheet['name']}」。{sheet['sheet']}"
            result = client.models.generate_content(
                model=self.settings.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system, temperature=1.0, max_output_tokens=120
                ),
            )
            text = (result.text or "").strip().strip("「」\"")
            if chore and not gals.acceptable(chore, text):
                return None
            return text if 0 < len(text) <= 60 else None
        except Exception:  # noqa: BLE001 -- notifications are best effort
            logging.getLogger(__name__).warning("notify_text_unavailable")
            return None

    def friend_text(self, gal, name, chore):
        gal = voice(gal)
        facts = dict(name=name, chore=gals.CHORES[chore], reward=gals.REWARDS[chore])
        made = self._gemini(gal, FRIEND_RULE, "友だち：{name}／家事：{chore}／ごほうび：{reward}".format(**facts), chore=chore)
        return made or random.choice(FRIEND_FALLBACK[gal]).format(**facts)

    def evening_text(self, gal):
        gal = voice(gal)
        return self._gemini(gal, EVENING_RULE, "今日の家事：まだ0個") or random.choice(EVENING_FALLBACK[gal])

    # ---------- delivery ----------
    def send(self, store, uid, body, link="/", title="だるぽよ"):
        """Send to every device of uid; drop tokens the push service says are gone."""
        record = store.get(f"notify/{uid}") or {}
        tokens = record.get("tokens", [])
        if not tokens:
            return 0
        if self.app is None:
            self.sent.append({"uid": uid, "title": title, "body": body, "tokens": list(tokens)})
            return len(tokens)
        from firebase_admin import messaging

        message = messaging.MulticastMessage(
            tokens=tokens,
            # Data only: the page's service worker shows it, so it never appears twice.
            data={"title": title, "body": body, "link": link},
            webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "21600"}),
        )
        try:
            result = messaging.send_each_for_multicast(message, app=self.app)
        except Exception:  # noqa: BLE001 -- never fail the request that triggered it
            logging.getLogger(__name__).warning("notify_send_failed")
            return 0
        gone = [
            token
            for token, response in zip(tokens, result.responses, strict=False)
            if not response.success
            and type(response.exception).__name__ in ("UnregisteredError", "SenderIdMismatchError")
        ]
        if gone:
            store.atomic(lambda tx: self._drop(tx, uid, gone))
        return result.success_count

    @staticmethod
    def _drop(tx, uid, gone):
        record = tx.get(f"notify/{uid}")
        if not record:
            return
        record["tokens"] = [t for t in record.get("tokens", []) if t not in gone]
        tx.set(f"notify/{uid}", record)

    # ---------- events ----------
    def friend_cleared(self, store, house, uid, chore):
        name = house["members"].get(uid, {}).get("display_name", "住人")
        for member in house["member_ids"]:
            record = store.get(f"notify/{member}") or {} if member != uid else {}
            if record.get("tokens"):
                self.send(store, member, self.friend_text(record.get("gal"), name, chore), title=f"{name}が{DONE[chore]}よ")

    def evening(self, store, day):
        """Nudge everyone who has done nothing today in any of their houses (once per person)."""
        done, members = set(), set()
        for house in store.list("houses", limit=1000):
            state = store.get(f"houses/{house['id']}/days/{day}") or {}
            done.update(uid for uid, chores in state.get("completed", {}).items() if chores)
            members.update(house.get("member_ids", []))
        nudged = 0
        for uid in sorted(members - done):
            record = store.get(f"notify/{uid}") or {}
            if record.get("tokens") and record.get("last_evening") != day:
                gal = voice(record.get("gal"))
                if self.send(store, uid, self.evening_text(gal), title=f"{gals.GALS[gal]['name']}から"):
                    nudged += 1
                store.atomic(lambda tx, uid=uid: self._mark_evening(tx, uid, day))
        return nudged

    @staticmethod
    def _mark_evening(tx, uid, day):
        record = tx.get(f"notify/{uid}")
        if not record:
            return
        record["last_evening"] = day
        tx.set(f"notify/{uid}", record)

    # ---------- settings ----------
    @staticmethod
    def save(store, uid, token=None, enabled=True, gal=None):
        def run(tx):
            require_active(tx, uid)
            record = tx.get(f"notify/{uid}") or {"uid": uid, "tokens": []}
            tokens = [t for t in record.get("tokens", []) if t != token]
            if token and enabled:
                tokens = [token, *tokens][:MAX_TOKENS]
            record["tokens"] = tokens
            if gal in GAL_CHOICES:
                record["gal"] = gal
            tx.set(f"notify/{uid}", record)
            return {"enabled": bool(token and enabled), "devices": len(tokens), "gal": record.get("gal")}

        return store.atomic(run)
