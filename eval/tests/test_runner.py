from __future__ import annotations

import json
from typing import Any, Iterator

import pytest

from faceq_eval.api import ApiError
from faceq_eval.models import (
    EndedEvent,
    ErrorEvent,
    EvidenceEvent,
    FocusProgress,
    SafetyEvent,
    SessionState,
    SSEEvent,
    StartSessionResponse,
    StatusEvent,
    TokenEvent,
    Coverage,
)
from faceq_eval.patient import PatientReply
from faceq_eval.runner import PersonaRunner, TurnFailed, consent_variant_for, run_all, start_session_body, write_record


class FakePatientClient:
    def __init__(self, replies: list[str] | None = None) -> None:
        self.calls: list[list[dict[str, str]]] = []
        self.replies = replies or []

    def complete(self, system: str, messages: list[dict[str, str]]) -> PatientReply:
        self.calls.append(messages)
        n = len(self.calls)
        text = self.replies[n - 1] if n - 1 < len(self.replies) else f"patient reply {n}"
        return PatientReply(text=text, input_tokens=10, output_tokens=5)


class FakeApi:
    """Scripted edge-function API. `script` is a list of per-turn event lists (or exceptions)."""

    def __init__(self, script: list[list[SSEEvent] | Exception], profile: dict[str, Any] | None = None, status_after: str = "completed") -> None:
        self.script = list(script)
        self.calls: list[tuple[str, Any]] = []
        self.profile = profile if profile is not None else {"domains": [], "declined": [], "patient_questions": []}
        self.status_after = status_after
        self.consented = False
        self.ended = False

    def sign_in(self) -> str:
        self.calls.append(("sign_in", None))
        return "jwt"

    def fetch_construct_map(self, slug: str):
        return {"slug": slug, "map": {"domains": []}}

    def start_session(self, body):
        self.calls.append(("start_session", body))
        return StartSessionResponse(session_id="s1", participant_id="p1", study_id="P-0001", resume_token="tok", patient_link_path="/p/tok")

    def session_state(self, resume_token):
        self.calls.append(("session_state", resume_token))
        return SessionState(session_id="s1", status="intake", consent_variant_needed="adult", max_turns=40)

    def consent(self, resume_token, consent_variant):
        self.calls.append(("consent", consent_variant))
        self.consented = True
        return SessionState(session_id="s1", status="consented")

    def chat_turn(self, session_id, resume_token, text, input_mode) -> Iterator[SSEEvent]:
        self.calls.append(("chat_turn", text))
        step = self.script.pop(0) if self.script else [TokenEvent(t="..."), EndedEvent(reason="turn_budget")]
        if isinstance(step, Exception):
            raise step
        yield from step

    def end_session(self, resume_token):
        self.calls.append(("end_session", resume_token))
        self.ended = True
        return {"status": "summary-review", "patient_summary": "Here is what I heard."}

    def confirm_summary(self, resume_token, corrections):
        self.calls.append(("confirm_summary", corrections))
        return {"status": "completed"}

    def get_profile(self, session_id):
        self.calls.append(("get_profile", session_id))
        # A profile row exists only once end-session has generated it (SPEC §7.7).
        if not self.ended:
            return None
        return {"session_id": session_id, "profile": self.profile, "patient_summary": "Here is what I heard."}

    def get_session_row(self, session_id):
        self.calls.append(("get_session_row", session_id))
        return {"id": session_id, "status": self.status_after, "input_tokens": 100, "output_tokens": 40, "cost_usd_estimate": 0.01}


def tokens(text: str) -> list[SSEEvent]:
    """Stream the text as word-sized token events (spaces attached to the preceding word)."""
    return [TokenEvent(t=w + (" " if i < len(text.split(" ")) - 1 else "")) for i, w in enumerate(text.split(" "))]


def status(covered: int, turns: int) -> StatusEvent:
    return StatusEvent(coverage=Coverage(covered=covered, total_active=9), turns_used=turns, max_turns=40)


def make_runner(api, patient: FakePatientClient, registry, **kw) -> PersonaRunner:
    sleeps: list[float] = []
    runner = PersonaRunner(api, lambda _p: patient, registry, sleep=sleeps.append, **kw)
    runner.sleeps = sleeps  # type: ignore[attr-defined]
    return runner


def test_loop_ends_on_ended_event_and_completes_flow(evasive_persona, registry, tmp_path):
    api = FakeApi(
        [
            tokens("Hi Priya, how are you?") + [status(0, 1)],
            tokens("Tell me about your lips.") + [status(1, 2)],
            tokens("Thanks, that is everything.") + [status(9, 3), EndedEvent(reason="coverage_complete")],
        ]
    )
    patient = FakePatientClient()
    runner = make_runner(api, patient, registry, max_turns=40)
    record = runner.run_persona(evasive_persona)

    assert record.outcome == "ended" and record.ended_reason == "coverage_complete"
    assert len(record.turns) == 3
    assert record.turns[0].patient_text is None and record.turns[0].assistant_text == "Hi Priya, how are you?"
    assert record.turns[1].patient_text == "patient reply 1"
    assert record.consent_variant == "adult"
    names = [c[0] for c in api.calls]
    assert names[:4] == ["sign_in", "start_session", "session_state", "consent"]
    assert names.count("chat_turn") == 3
    assert "end_session" in names and "confirm_summary" in names and "get_profile" in names
    assert api.calls[names.index("chat_turn")][1] is None  # opening request uses text: null
    assert record.patient_summary == "Here is what I heard."
    assert record.profile == api.profile and record.session_row["input_tokens"] == 100
    assert record.final_status == "completed"
    assert record.patient_tokens == {"input": 20, "output": 10}
    # The patient saw the interviewer's messages as `user` turns with the reply counter.
    assert patient.calls[0][0]["role"] == "user" and patient.calls[0][0]["content"].startswith("[reply 1 of ~40]")
    assert len(patient.calls[1]) == 3

    path = write_record(tmp_path, record)
    data = json.loads(path.read_text())
    assert data["persona_id"] == evasive_persona.id and data["turns"][2]["events"][-1]["event"] == "ended"


def test_start_session_body_and_consent_variant(personas, evasive_persona):
    body = start_session_body(evasive_persona)
    assert body["participant"]["study_id"] is None
    assert body["participant"]["display_name"] == "Priya" and body["respondent"] == "self"
    assert "clinician_note" not in body
    both = next(p for p in personas if p.id == "en_pediatric_craniosynostosis_both")
    body = start_session_body(both)
    assert body["clinician_note"]["focus_constructs"] == ["social.school", "appearance.overall", "adverse.swelling_bruising"]
    assert consent_variant_for(both) == "minor-assent"
    assert consent_variant_for(next(p for p in personas if p.id == "es_pediatric_cleft_guardian")) == "guardian"
    assert consent_variant_for(evasive_persona) == "adult"


def test_loop_halts_on_safety_event_without_end_session(safety_persona, registry):
    api = FakeApi(
        [
            tokens("Hello Walter."),
            tokens("How is eating going?"),
            [SafetyEvent(message="If you are in danger, contact local emergency services.")],
        ],
        status_after="safety-halted",
    )
    runner = make_runner(api, FakePatientClient(), registry)
    record = runner.run_persona(safety_persona)
    assert record.outcome == "safety"
    assert record.safety_message.startswith("If you are in danger")
    names = [c[0] for c in api.calls]
    assert "end_session" not in names and "confirm_summary" not in names
    assert "get_session_row" in names and record.final_status == "safety-halted"
    assert len(record.turns) == 3 and record.error is None


def test_retries_once_on_retryable_error_event(evasive_persona, registry):
    api = FakeApi(
        [
            tokens("Hi"),
            [ErrorEvent(retryable=True, message="overloaded")],
            tokens("Sorry, again: how are you?") + [EndedEvent(reason="patient_requested")],
        ]
    )
    runner = make_runner(api, FakePatientClient(), registry, retry_delay_s=2.0)
    record = runner.run_persona(evasive_persona)
    assert record.outcome == "ended" and record.error is None
    assert len(record.turns) == 2 and record.turns[1].retried is True
    assert record.turns[1].assistant_text == "Sorry, again: how are you?"
    chat_calls = [c for c in api.calls if c[0] == "chat_turn"]
    assert len(chat_calls) == 3 and chat_calls[1][1] == chat_calls[2][1] == "patient reply 1"
    assert runner.sleeps == [2.0]


def test_retries_once_on_retryable_api_error_then_gives_up(evasive_persona, registry):
    api = FakeApi([tokens("Hi"), ApiError("502", status=502, retryable=True), ApiError("502", status=502, retryable=True)])
    runner = make_runner(api, FakePatientClient(), registry)
    record = runner.run_persona(evasive_persona)
    assert record.outcome == "error" and "502" in record.error
    assert [c[0] for c in api.calls].count("chat_turn") == 3
    assert record.session_id == "s1"  # read-back still attempted
    assert record.session_row is not None


def test_non_retryable_error_event_fails_fast(evasive_persona, registry):
    api = FakeApi([tokens("Hi"), [ErrorEvent(retryable=False, message="invalid token")]])
    runner = make_runner(api, FakePatientClient(), registry)
    record = runner.run_persona(evasive_persona)
    assert record.outcome == "error" and "invalid token" in record.error
    assert [c[0] for c in api.calls].count("chat_turn") == 2 and runner.sleeps == []


def test_turn_raises_turnfailed_on_second_failure(evasive_persona, registry):
    api = FakeApi([[ErrorEvent(retryable=True, message="a")], [ErrorEvent(retryable=True, message="b")]])
    runner = make_runner(api, FakePatientClient(), registry)
    with pytest.raises(TurnFailed, match="b"):
        runner.turn("s1", "tok", "hello", "text")


def test_harness_max_turns_cap_then_ends_session(evasive_persona, registry):
    api = FakeApi([tokens(f"q{i}") for i in range(10)])
    runner = make_runner(api, FakePatientClient(), registry, max_turns=4)
    record = runner.run_persona(evasive_persona)
    assert record.outcome == "max_turns" and len(record.turns) == 4
    assert "end_session" in [c[0] for c in api.calls]


def test_summary_correction_is_submitted(personas, registry):
    persona = next(p for p in personas if p.id == "en_adult_facelift_medical")
    api = FakeApi([tokens("Hi") + [EndedEvent(reason="coverage_complete")]])
    record = make_runner(api, FakePatientClient(), registry).run_persona(persona)
    corrections = next(c[1] for c in api.calls if c[0] == "confirm_summary")
    assert corrections == [{"construct_id": "adverse.pain_discomfort", "patient_text": persona.expected_behaviours.summary_correction.patient_text}]
    assert record.correction_submitted["construct_id"] == "adverse.pain_discomfort"


# ------------------------------------------------------------------ v1.1 latency / phase


class FakeClock:
    """Monotonic clock the fake API advances explicitly; seconds."""

    def __init__(self) -> None:
        self.t = 100.0

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


class TimedApi(FakeApi):
    """Advances a FakeClock between events, so the runner measures known gaps.

    `gaps` is a per-turn list of seconds to burn before each yielded event.
    """

    def __init__(self, script, gaps: list[list[float]], clock: FakeClock, **kw) -> None:
        super().__init__(script, **kw)
        self.gaps = list(gaps)
        self.clock = clock

    def chat_turn(self, session_id, resume_token, text, input_mode):
        self.calls.append(("chat_turn", text))
        step = self.script.pop(0) if self.script else [TokenEvent(t="..."), EndedEvent(reason="turn_budget")]
        gaps = self.gaps.pop(0) if self.gaps else []
        for i, ev in enumerate(step):
            self.clock.advance(gaps[i] if i < len(gaps) else 0.0)
            yield ev


def v11_status(covered: int, turns: int, phase: str, focus: str | None, confirmed: int = 0, total: int = 3) -> StatusEvent:
    return StatusEvent(
        coverage=Coverage(covered=covered, total_active=9),
        turns_used=turns,
        max_turns=60,
        phase=phase,
        current_focus=focus,
        focus_progress=FocusProgress(confirmed=confirmed, total=total),
    )


def test_runner_records_ttft_turn_ms_and_phase(evasive_persona, registry):
    clock = FakeClock()
    api = TimedApi(
        [
            # opening: 0.4s to the first token, tokens, then status 0.2s later
            [TokenEvent(t="Hi "), TokenEvent(t="Priya."), v11_status(0, 1, "triage", None)],
            # a normal turn: text streams, evidence arrives AFTER the text, then status
            [
                TokenEvent(t="And "),
                TokenEvent(t="your lips?"),
                EvidenceEvent(construct_id="appearance.lips", severity="severe", facets=["shape"], triage_item="features"),
                v11_status(3, 2, "explore", "appearance.lips", confirmed=1),
                EndedEvent(reason="coverage_complete"),
            ],
        ],
        gaps=[[0.4, 0.05, 0.2], [1.0, 0.1, 0.6, 0.3, 0.0]],
        clock=clock,
    )
    runner = make_runner(api, FakePatientClient(), registry, clock=clock)
    record = runner.run_persona(evasive_persona)

    first, second = record.turns
    assert first.time_to_first_token_ms == 400.0
    assert first.turn_ms == pytest.approx(650.0)  # 0.4 + 0.05 + 0.2
    assert first.phase == "triage" and first.current_focus is None
    assert first.focus_progress == {"confirmed": 0, "total": 3}

    assert second.time_to_first_token_ms == 1000.0
    assert second.turn_ms == pytest.approx(2000.0)  # 1.0 + 0.1 + 0.6 + 0.3
    assert second.phase == "explore" and second.current_focus == "appearance.lips"
    assert second.focus_progress == {"confirmed": 1, "total": 3}
    # the evidence event is persisted with its v1.1 fields, after the text
    events = second.events
    assert [e["event"] for e in events] == ["token", "token", "evidence", "status", "ended"]
    assert events[2]["facets"] == ["shape"] and events[2]["triage_item"] == "features"
    assert second.assistant_text == "And your lips?"


def test_latency_fields_are_none_without_token_or_status_events(evasive_persona, registry):
    clock = FakeClock()
    api = TimedApi([[v11_status(0, 1, "triage", None)], [TokenEvent(t="bye"), EndedEvent(reason="turn_budget")]],
                   gaps=[[0.3], [0.5, 0.1]], clock=clock)
    record = make_runner(api, FakePatientClient(), registry, clock=clock).run_persona(evasive_persona)
    assert record.turns[0].time_to_first_token_ms is None and record.turns[0].turn_ms == 300.0
    assert record.turns[1].time_to_first_token_ms == 500.0 and record.turns[1].turn_ms is None


def test_latency_survives_a_retry_and_reflects_the_successful_attempt(evasive_persona, registry):
    clock = FakeClock()
    api = TimedApi(
        [
            [TokenEvent(t="Hi"), v11_status(0, 1, "triage", None)],
            [ErrorEvent(retryable=True, message="overloaded")],
            [TokenEvent(t="Sorry, again."), v11_status(1, 2, "triage", None), EndedEvent(reason="patient_requested")],
        ],
        gaps=[[0.2, 0.1], [5.0], [0.3, 0.2, 0.0]],
        clock=clock,
    )
    record = make_runner(api, FakePatientClient(), registry, clock=clock).run_persona(evasive_persona)
    assert record.turns[1].retried is True
    assert record.turns[1].time_to_first_token_ms == 300.0  # the retry, not the failed attempt
    assert record.turns[1].turn_ms == 500.0


def test_persisted_run_json_round_trips_the_latency_fields(evasive_persona, registry, tmp_path):
    clock = FakeClock()
    api = TimedApi([[TokenEvent(t="Hi"), v11_status(0, 1, "explore", "appearance.lips"), EndedEvent(reason="coverage_complete")]],
                   gaps=[[0.25, 0.75, 0.0]], clock=clock)
    record = make_runner(api, FakePatientClient(), registry, clock=clock).run_persona(evasive_persona)
    data = json.loads(write_record(tmp_path, record).read_text())
    turn = data["turns"][0]
    assert turn["time_to_first_token_ms"] == 250.0 and turn["turn_ms"] == 1000.0
    assert turn["phase"] == "explore" and turn["current_focus"] == "appearance.lips"


def test_run_all_writes_files_sequential_and_parallel(personas, registry, tmp_path):
    subset = [p for p in personas if p.id in ("en_adult_rhinoplasty_terse", "es_adult_facelift_chatty")]
    for parallel in (1, 2):
        api = FakeApi([])  # default script: every turn ends immediately
        runner = make_runner(api, FakePatientClient(), registry)
        run_dir = tmp_path / f"run{parallel}"
        run_dir.mkdir()
        records = run_all(runner, subset, run_dir, parallel=parallel, construct_maps={"adult": {"map": {"domains": []}}, "pediatric": None})
        assert [r.persona_id for r in records] == sorted(p.id for p in subset)
        assert (run_dir / "_construct_map.json").exists() and (run_dir / "_meta.json").exists()
        assert {p.name for p in run_dir.glob("*.json")} >= {f"{p.id}.json" for p in subset}
