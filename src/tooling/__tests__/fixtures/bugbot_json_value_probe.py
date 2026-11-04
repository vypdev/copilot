"""Authored JSON boundary controls; imported only by the fixed optional runner."""
import json
from typing import cast


class ObjectFrame:
    def __init__(self, text: str):
        self.text = text
        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError("object-required")

    def decode(self) -> dict:
        return json.loads(self.text)


class TextFrame:
    def __init__(self, text: str):
        self.text = text

    def decode(self) -> str:
        return self.text


def payload():
    return {"revision": 1, "tags": ["雪", None, True], "quoted": '"hi"'}


def object_frame():
    return ObjectFrame(json.dumps(payload()))


def read_object(text: str) -> dict:
    # This boundary accepts JSON text representing one object, never a dict/string value.
    if not isinstance(text, str):
        raise TypeError("json-text-required")
    return ObjectFrame(text).decode()


def annotated_text() -> str:
    # Python annotations do not convert values.
    return object_frame().decode()


def decoded_object():
    row = {"entry": object_frame().decode()}
    return read_object(json.dumps(row["entry"]))


def nested_outer_object():
    stored = json.dumps({"entry": object_frame().decode()})
    row = ObjectFrame(stored).decode()
    return read_object(json.dumps(row["entry"]))


def text_decoder():
    row = {"entry": TextFrame(json.dumps(payload())).decode()}
    return read_object(cast(str, row["entry"]))


def guarded_text_cast():
    row = {"entry": json.dumps(payload())}
    if not isinstance(row["entry"], str):
        raise TypeError("text-required")
    return read_object(cast(str, row["entry"]))


def unicode_nested_value():
    row = json.loads(json.dumps({"entry": payload()}, ensure_ascii=False))
    return read_object(json.dumps(row["entry"], ensure_ascii=False))


def separate_serialization_levels():
    inner = json.dumps(payload())
    row = json.loads(json.dumps({"entry": inner}))
    return read_object(row["entry"])


def object_cast_into_text_reader():
    row = {"entry": object_frame().decode()}
    return read_object(cast(str, row["entry"]))


def text_encoded_twice():
    row = {"entry": json.dumps(payload())}
    return read_object(json.dumps(row["entry"]))


def raw_object_into_text_reader():
    row = json.loads(json.dumps({"entry": payload()}))
    return read_object(row["entry"])


def python_repr_as_json():
    row = {"entry": object_frame().decode()}
    return read_object(str(row["entry"]))


def missing_inner_decode():
    row = {"entry": object_frame().text}
    return read_object(json.dumps(row["entry"]))


def annotation_is_not_conversion():
    row = {"entry": annotated_text()}
    return read_object(row["entry"])
