"""Resident theme colors: one per resident, never shared inside a house.

The color paints the resident's room, the clothes they hang on the balcony and
the outfit of their gal. Order matters: a newcomer gets the first free color.
"""

THEMES = (
    "pink", "cyan", "lilac", "lime", "peach", "mint", "cream", "night",
    "coral", "sky", "grape", "leaf", "orange", "teal", "berry", "cocoa",
)


def normalize_themes(house):
    """Give every resident a color no earlier resident uses (earlier residents keep theirs)."""
    used = set()
    for uid in house["member_ids"]:
        member = house["members"][uid]
        theme = member.get("theme")
        if theme not in THEMES or theme in used:
            theme = next(t for t in THEMES if t not in used)
            member["theme"] = theme
        used.add(theme)
    return house


def taken_by_other(house, uid, theme):
    return any(other != uid and house["members"][other].get("theme") == theme for other in house["member_ids"])
