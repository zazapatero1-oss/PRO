from faceq_eval.models import EndedEvent, ErrorEvent, EvidenceEvent, SafetyEvent, StatusEvent, TokenEvent, UnknownEvent
from faceq_eval.sse import SSEParser, parse_stream

STREAM = (
    b'event: token\ndata: {"t": "Hello"}\n\n'
    b'event: token\ndata: {"t": " there"}\n\n'
    b'event: evidence\ndata: {"construct_id": "appearance.nose", "severity": "severe", "confidence": 0.9}\n\n'
    b'event: status\ndata: {"coverage": {"covered": 3, "total_active": 9}, "turns_used": 2, "max_turns": 40}\n\n'
    b'event: ended\ndata: {"reason": "coverage_complete"}\n\n'
)


def test_parses_whole_stream_in_one_chunk():
    events = list(parse_stream([STREAM]))
    assert [type(e) for e in events] == [TokenEvent, TokenEvent, EvidenceEvent, StatusEvent, EndedEvent]
    assert "".join(e.t for e in events if isinstance(e, TokenEvent)) == "Hello there"
    assert events[3].coverage.covered == 3 and events[3].max_turns == 40
    assert events[4].reason == "coverage_complete"


def test_chunk_boundaries_mid_event_and_mid_line():
    # Split at every 7 bytes: boundaries fall inside field names, inside JSON and inside "\n\n".
    chunks = [STREAM[i : i + 7] for i in range(0, len(STREAM), 7)]
    events = list(parse_stream(chunks))
    assert [type(e) for e in events] == [TokenEvent, TokenEvent, EvidenceEvent, StatusEvent, EndedEvent]
    assert events[2].construct_id == "appearance.nose"


def test_split_inside_multibyte_utf8():
    payload = 'event: token\ndata: {"t": "señora ñandú"}\n\n'.encode("utf-8")
    chunks = [payload[:22], payload[22:23], payload[23:]]  # split inside "ñ"
    (ev,) = list(parse_stream(chunks))
    assert isinstance(ev, TokenEvent)
    assert ev.t == "señora ñandú"


def test_multiple_events_per_chunk_and_crlf():
    raw = b'event: token\r\ndata: {"t": "a"}\r\n\r\nevent: safety\r\ndata: {"message": "fixed text"}\r\n\r\n'
    events = list(parse_stream([raw]))
    assert isinstance(events[0], TokenEvent) and events[0].t == "a"
    assert isinstance(events[1], SafetyEvent) and events[1].message == "fixed text"


def test_multiline_data_comments_and_no_space_after_colon():
    raw = b': keep-alive\n\nevent:token\ndata:{"t":\ndata: "x"}\n\n'
    events = list(parse_stream([raw]))
    assert len(events) == 1 and isinstance(events[0], TokenEvent) and events[0].t == "x"


def test_error_event_and_unknown_event():
    raw = b'event: error\ndata: {"retryable": true, "message": "upstream"}\n\nevent: heartbeat\ndata: {}\n\nevent: token\ndata: not json\n\n'
    events = list(parse_stream([raw]))
    assert isinstance(events[0], ErrorEvent) and events[0].retryable is True
    assert isinstance(events[1], UnknownEvent) and events[1].event == "heartbeat"
    assert isinstance(events[2], UnknownEvent) and events[2].data == "not json"


def test_trailing_event_without_blank_line_is_flushed_on_close():
    parser = SSEParser()
    got = list(parser.feed(b'event: ended\ndata: {"reason": "turn_budget"}'))
    assert got == []
    got = list(parser.close())
    assert len(got) == 1 and isinstance(got[0], EndedEvent) and got[0].reason == "turn_budget"


# ------------------------------------------------------------------ v1.1 ordering / shapes

# SPEC v1.1 §C: the talk call streams first and extraction runs afterwards, so
# `evidence` events arrive AFTER the reply text and before `status`.
V11_STREAM = (
    b'event: token\ndata: {"t": "And how"}\n\n'
    b'event: token\ndata: {"t": " are your eyes?"}\n\n'
    b'event: evidence\ndata: {"construct_id": "appearance.eyes", "severity": "moderate", "confidence": 0.8,'
    b' "facets": ["shape", "symmetry"], "triage_item": "features"}\n\n'
    b'event: evidence\ndata: {"construct_id": "psych.mood", "severity": "mild", "confidence": 0.6, "facets": []}\n\n'
    b'event: status\ndata: {"coverage": {"covered": 4, "total_active": 9}, "phase": "explore",'
    b' "current_focus": "appearance.eyes", "focus_progress": {"confirmed": 1, "total": 3},'
    b' "turns_used": 7, "max_turns": 60}\n\n'
)


def test_evidence_after_text_then_status():
    events = list(parse_stream([V11_STREAM]))
    assert [type(e) for e in events] == [TokenEvent, TokenEvent, EvidenceEvent, EvidenceEvent, StatusEvent]
    # the reply text is complete before any evidence arrives
    assert isinstance(events[1], TokenEvent) and "".join(e.t for e in events[:2]) == "And how are your eyes?"
    assert events[2].facets == ["shape", "symmetry"] and events[2].triage_item == "features"
    assert events[3].facets == [] and events[3].triage_item is None


def test_status_carries_phase_focus_and_progress():
    status = list(parse_stream([V11_STREAM]))[-1]
    assert isinstance(status, StatusEvent)
    assert status.phase == "explore" and status.current_focus == "appearance.eyes"
    assert status.focus_progress.confirmed == 1 and status.focus_progress.total == 3
    assert status.coverage.total_active == 9 and status.turns_used == 7 and status.max_turns == 60


def test_v11_stream_survives_tight_chunk_boundaries():
    chunks = [V11_STREAM[i : i + 5] for i in range(0, len(V11_STREAM), 5)]
    events = list(parse_stream(chunks))
    assert [type(e) for e in events] == [TokenEvent, TokenEvent, EvidenceEvent, EvidenceEvent, StatusEvent]
    assert events[-1].current_focus == "appearance.eyes"


def test_status_without_v11_fields_still_parses():
    """A pre-v1.1 engine (no phase/focus) must not fall back to UnknownEvent."""
    (ev,) = list(parse_stream([b'event: status\ndata: {"coverage": {"covered": 1, "total_active": 2},'
                              b' "turns_used": 1, "max_turns": 40}\n\n']))
    assert isinstance(ev, StatusEvent)
    assert ev.phase is None and ev.current_focus is None and ev.focus_progress is None


def test_status_with_unknown_phase_is_unknown_event():
    (ev,) = list(parse_stream([b'event: status\ndata: {"coverage": {"covered": 1, "total_active": 2},'
                              b' "turns_used": 1, "max_turns": 40, "phase": "nonsense"}\n\n']))
    assert isinstance(ev, UnknownEvent) and ev.data["phase"] == "nonsense"


def test_null_current_focus_during_triage():
    (ev,) = list(parse_stream([b'event: status\ndata: {"coverage": {"covered": 0, "total_active": 9},'
                              b' "phase": "triage", "current_focus": null,'
                              b' "focus_progress": {"confirmed": 0, "total": 0}, "turns_used": 2, "max_turns": 60}\n\n']))
    assert isinstance(ev, StatusEvent) and ev.phase == "triage" and ev.current_focus is None


def test_default_event_name_is_message_and_resets():
    events = list(parse_stream([b'data: {"t": "no name"}\n\nevent: token\ndata: {"t": "named"}\n\n']))
    assert isinstance(events[0], UnknownEvent) and events[0].event == "message"
    assert isinstance(events[1], TokenEvent)
