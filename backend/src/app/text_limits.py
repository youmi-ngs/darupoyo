"""Visible-character limits shared by every write API; stored history is untouched."""
from typing import Annotated
import regex
from pydantic import AfterValidator

def limited(limit):
    def validate(value):
        if len(regex.findall(r"\X", value)) > limit:
            raise ValueError(f"Use at most {limit} characters")
        return value
    return validate

UserName = Annotated[str, AfterValidator(limited(12))]
HouseName = Annotated[str, AfterValidator(limited(20))]
Caption = Annotated[str, AfterValidator(limited(30))]
