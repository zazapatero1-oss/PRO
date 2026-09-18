"""Incremental parser for the chat-turn `text/event-stream` (SPEC §7.6).

Feed it raw byte chunks in whatever sizes the transport delivers; it buffers
across chunk boundaries and yields one typed event per complete SSE message.
"""

from __future__ import annotations

import json
from typing import Iterable, Iterator

from pydantic import ValidationError

from faceq_eval.models import (
    EndedEvent,
    ErrorEvent,
    EvidenceEvent,
    SafetyEvent,
    SSEEvent,
    StatusEvent,
    TokenEvent,
    UnknownEvent,
)

_TYPED = {
    "token": TokenEvent,
    "evidence": EvidenceEvent,
    "status": StatusEvent,
    "safety": SafetyEvent,
    "ended": EndedEvent,
    "error": ErrorEvent,
}


def parse_event(event_name: str, data: str) -> SSEEvent:
    """Build a typed event from an SSE `event:` name and joined `data:` payload."""
    try:
        payload = json.loads(data) if data.strip() else {}
    except json.JSONDecodeError:
        return UnknownEvent(event=event_name, data=data)
    model = _TYPED.get(event_name)
    if model is None or not isinstance(payload, dict):
        return UnknownEvent(event=event_name, data=payload)
    try:
        return model.model_validate(payload)
    except ValidationError:
        return UnknownEvent(event=event_name, data=payload)


class SSEParser:
    def __init__(self) -> None:
        self._buf = ""
        self._event_name = "message"
        self._data_lines: list[str] = []

    def feed(self, chunk: bytes | str) -> Iterator[SSEEvent]:
        text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else chunk
        self._buf += text
        while True:
            nl = self._buf.find("\n")
            if nl < 0:
                break
            line = self._buf[:nl]
            self._buf = self._buf[nl + 1 :]
            if line.endswith("\r"):
                line = line[:-1]
            event = self._consume_line(line)
            if event is not None:
                yield event

    def close(self) -> Iterator[SSEEvent]:
        """Flush a trailing message that was not terminated by a blank line."""
        if self._buf:
            line, self._buf = self._buf.rstrip("\r"), ""
            event = self._consume_line(line)
            if event is not None:
                yield event
        if self._data_lines:
            yield self._dispatch()

    def _consume_line(self, line: str) -> SSEEvent | None:
        if line == "":
            if self._data_lines:
                return self._dispatch()
            self._event_name = "message"
            return None
        if line.startswith(":"):
            return None
        field, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if field == "event":
            self._event_name = value or "message"
        elif field == "data":
            self._data_lines.append(value)
        # `id` and `retry` are ignored.
        return None

    def _dispatch(self) -> SSEEvent:
        data = "\n".join(self._data_lines)
        name = self._event_name
        self._data_lines = []
        self._event_name = "message"
        return parse_event(name, data)


def parse_stream(chunks: Iterable[bytes | str]) -> Iterator[SSEEvent]:
    parser = SSEParser()
    for chunk in chunks:
        yield from parser.feed(chunk)
    yield from parser.close()
