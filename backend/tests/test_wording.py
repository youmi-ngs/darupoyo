import random
from types import SimpleNamespace

from src.app import gals, notify
from src.app.config import Settings


def test_meal_praise_is_plain_well_done_without_laziness_or_cooking(monkeypatch):
    # #134: no 「だるいのに」 angle and no laziness words for meals; other chores keep that angle.
    for seed in range(50):
        system, contents = gals.prompt("meal", "kuro", rng=random.Random(seed))
        assert "だるいのにやったこと" not in contents
    assert "だるいのに" in gals.MEAL_RULE  # the rule names what to avoid
    assert any("だるいのにやったこと" in gals.prompt("laundry", "kuro", rng=random.Random(s))[1] for s in range(50))
    for line in ("だるいのにごはん食べてえらい", "面倒なのに食べたの最強", "自炊してえらい", "手料理とか神", "作ってえらいじゃん"):
        assert not gals.acceptable("meal", line)
    assert gals.acceptable("meal", "ちゃんとごはん食べたの、えらすぎ。おつかれさま")
    assert gals.acceptable("laundry", "だるいのに洗濯したの最強")


class OneLine:
    """A Gemini stand-in that always answers with the same line and keeps the system prompt."""
    def __init__(self, line):
        self.line, self.systems = line, []
        self.client = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    def _generate(self, model, contents, config):
        self.systems.append(config.system_instruction)
        return SimpleNamespace(text=self.line)


def test_friend_notifications_follow_the_meal_rule():
    # #145: a notification about a friend's meal never says they cooked it.
    settings = Settings(app_env="test", data_backend="memory", auth_mode="dev", model="m")
    cooking = OneLine("さくら、自炊してえらい！ほめにいこ")
    text = notify.Notifier(settings, praise=cooking).friend_text("reiwa", "さくら", "meal")
    assert "自炊" not in text and text in {line.format(name="さくら", chore="ごはん", reward="ツヤ肌") for line in notify.FRIEND_FALLBACK["reiwa"]}
    assert gals.MEAL_RULE in cooking.systems[0]
    fine = OneLine("さくらがツヤ肌ゲット！ほめにいこ")
    assert notify.Notifier(settings, praise=fine).friend_text("reiwa", "さくら", "meal") == "さくらがツヤ肌ゲット！ほめにいこ"
    # Other chores do not get the meal rule.
    laundry = OneLine("さくらが洗濯したって！ほめよ")
    notify.Notifier(settings, praise=laundry).friend_text("reiwa", "さくら", "laundry")
    assert gals.MEAL_RULE not in laundry.systems[0]
