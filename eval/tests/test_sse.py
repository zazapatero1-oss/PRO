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


def test_default_event_name_is_message_and_resets():
    events = list(parse_stream([b'data: {"t": "no name"}\n\nevent: token\ndata: {"t": "named"}\n\n']))
    assert isinstance(events[0], UnknownEvent) and events[0].event == "message"
    assert isinstance(events[1], TokenEvent)
