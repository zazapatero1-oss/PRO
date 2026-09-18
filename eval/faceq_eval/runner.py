"""Drive one full session per persona against the edge functions.

Flow per persona (SPEC §7.7): start-session as clinician → consent → opening
message (`text: null`) → patient/assistant loop until `ended`, `safety` or the
turn cap → end-session → optional summary correction → confirm-summary → read
the profile and session row from the DB → persist everything as JSON.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from faceq_eval.api import ApiError, FaceQApi
from faceq_eval.models import (
    ConstructRegistry,
    EndedEvent,
    ErrorEvent,
    Persona,
    RunRecord,
    SafetyEvent,
    SSEEvent,
    TokenEvent,
    TurnRecord,
)
from faceq_eval.patient import PatientClient, SimulatedPatient

log = logging.getLogger("faceq_eval.runner")

REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"


class TurnFailed(RuntimeError):
    pass


@dataclass
class TurnResult:
    assistant_text: str
    events: list[SSEEvent]
    retried: bool
    latency_s: float

    @property
    def terminal(self) -> str | None:
        for ev in self.events:
            if isinstance(ev, SafetyEvent):
                return "safety"
            if isinstance(ev, EndedEvent):
                return "ended"
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def consent_variant_for(persona: Persona) -> str:
    if persona.population == "adult":
        return "adult"
    return "guardian" if persona.respondent == "guardian" else "minor-assent"


def start_session_body(persona: Persona) -> dict[str, Any]:
    body: dict[str, Any] = {
        "participant": {"study_id": None, **persona.intake.model_dump()},
        "timepoint": persona.timepoint,
        "respondent": persona.respondent,
    }
    if persona.clinician_note:
        body["clinician_note"] = persona.clinician_note.model_dump()
    return body


class PersonaRunner:
    def __init__(
        self,
        api: FaceQApi,
        patient_client_factory: Callable[[Persona], PatientClient],
        registry: ConstructRegistry,
        *,
        max_turns: int = 40,
        retry_delay_s: float = 2.0,
        sleep: Callable[[float], None] = time.sleep,
        patient_model: str | None = None,
    ) -> None:
        self.api = api
        self.patient_client_factory = patient_client_factory
        self.registry = registry
        self.max_turns = max_turns
        self.retry_delay_s = retry_delay_s
        self.sleep = sleep
        self.patient_model = patient_model

    # ------------------------------------------------------------------ one turn

    def _collect(self, session_id: str, token: str, text: str | None, input_mode: str | None) -> TurnResult:
        t0 = time.monotonic()
        events = list(self.api.chat_turn(session_id, token, text, input_mode))
        assistant_text = "".join(ev.t for ev in events if isinstance(ev, TokenEvent))
        return TurnResult(assistant_text, events, retried=False, latency_s=time.monotonic() - t0)

    def turn(self, session_id: str, token: str, text: str | None, input_mode: str | None) -> TurnResult:
        """One chat-turn with a single retry on a retryable error (SPEC §7.6)."""
        attempts = 0
        while True:
            attempts += 1
            try:
                result = self._collect(session_id, token, text, input_mode)
                error = next((ev for ev in result.events if isinstance(ev, ErrorEvent)), None)
                if error is None:
                    result.retried = attempts > 1
                    return result
                if not error.retryable or attempts >= 2:
                    raise TurnFailed(f"chat-turn error: {error.message}")
                log.warning("retryable error on turn, retrying once: %s", error.message)
            except ApiError as exc:
                if not exc.retryable or attempts >= 2:
                    raise TurnFailed(str(exc)) from exc
                log.warning("retryable API error, retrying once: %s", exc)
            except (ConnectionError, TimeoutError, OSError) as exc:
                if attempts >= 2:
                    raise TurnFailed(f"transport error: {exc}") from exc
                log.warning("transport error, retrying once: %s", exc)
            self.sleep(self.retry_delay_s)

    # ------------------------------------------------------------------ one persona

    def run_persona(self, persona: Persona) -> RunRecord:
        record = RunRecord(persona_id=persona.id, started_at=_now(), patient_model=self.patient_model)
        t0 = time.monotonic()
        try:
            self._run_persona(persona, record)
        except Exception as exc:  # noqa: BLE001 - one persona failing must not kill the run
            log.exception("persona %s failed", persona.id)
            record.error = f"{type(exc).__name__}: {exc}"
            if record.outcome not in ("ended", "safety", "max_turns"):
                record.outcome = "error"
            self._read_back(record, best_effort=True)
        record.wall_time_s = round(time.monotonic() - t0, 2)
        record.finished_at = _now()
        return record

    def _run_persona(self, persona: Persona, record: RunRecord) -> None:
        api = self.api
        api.sign_in()
        started = api.start_session(start_session_body(persona))
        record.session_id, record.participant_id, record.study_id = (
            started.session_id,
            started.participant_id,
            started.study_id,
        )
        token = started.resume_token

        state = api.session_state(token)
        if state.status == "intake" or state.consent_variant_needed:
            variant = state.consent_variant_needed or consent_variant_for(persona)
            api.consent(token, variant)
            record.consent_variant = variant
        max_turns = min(self.max_turns, state.max_turns or self.max_turns)

        patient = SimulatedPatient(persona, self.registry, self.patient_client_factory(persona), max_turns=max_turns)

        result = self.turn(started.session_id, token, None, None)
        self._record_turn(record, 1, None, None, result)
        terminal = result.terminal

        turn_no = 1
        while terminal is None and turn_no < max_turns:
            patient_text = patient.reply(result.assistant_text)
            result = self.turn(started.session_id, token, patient_text, patient.input_mode())
            turn_no += 1
            self._record_turn(record, turn_no, patient_text, patient.input_mode(), result)
            terminal = result.terminal

        record.patient_tokens = {"input": patient.input_tokens, "output": patient.output_tokens}

        if terminal == "safety":
            record.outcome = "safety"
            record.safety_message = next(ev.message for ev in result.events if isinstance(ev, SafetyEvent))
            self._read_back(record)
            return

        if terminal == "ended":
            record.outcome = "ended"
            record.ended_reason = next(ev.reason for ev in result.events if isinstance(ev, EndedEvent))
        else:
            record.outcome = "max_turns"

        ended = api.end_session(token)
        record.patient_summary = ended.get("patient_summary")
        corrections: list[dict[str, Any]] = []
        correction = persona.expected_behaviours.summary_correction
        if correction is not None:
            corrections.append(correction.model_dump())
            record.correction_submitted = correction.model_dump()
        confirmed = api.confirm_summary(token, corrections)
        record.final_status = confirmed.get("status")
        self._read_back(record)

    def _record_turn(
        self,
        record: RunRecord,
        turn_no: int,
        patient_text: str | None,
        input_mode: str | None,
        result: TurnResult,
    ) -> None:
        record.turns.append(
            TurnRecord(
                turn=turn_no,
                patient_text=patient_text,
                input_mode=input_mode,
                assistant_text=result.assistant_text,
                events=[ev.model_dump() for ev in result.events],
                retried=result.retried,
                latency_s=round(result.latency_s, 3),
            )
        )

    def _read_back(self, record: RunRecord, *, best_effort: bool = False) -> None:
        if not record.session_id:
            return
        try:
            row = self.api.get_profile(record.session_id)
            if row:
                record.profile = row.get("profile") if isinstance(row.get("profile"), dict) else None
                record.patient_summary = record.patient_summary or row.get("patient_summary")
                record.profile_meta = {k: v for k, v in row.items() if k not in ("profile", "patient_summary")}
            session_row = self.api.get_session_row(record.session_id)
            if session_row:
                record.session_row = session_row
                record.final_status = session_row.get("status") or record.final_status
        except Exception as exc:  # noqa: BLE001
            if not best_effort:
                raise
            log.warning("could not read back session %s: %s", record.session_id, exc)




# ---------------------------------------------------------------------- a whole run


def new_run_dir(reports_dir: Path = REPORTS_DIR, stamp: str | None = None) -> Path:
    stamp = stamp or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = reports_dir / "runs" / stamp
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def write_record(run_dir: Path, record: RunRecord) -> Path:
    path = run_dir / f"{record.persona_id}.json"
    path.write_text(json.dumps(record.model_dump(), indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def run_all(
    runner: PersonaRunner,
    personas: list[Persona],
    run_dir: Path,
    *,
    parallel: int = 1,
    construct_maps: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> list[RunRecord]:
    if construct_maps is not None:
        (run_dir / "_construct_map.json").write_text(
            json.dumps(construct_maps, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    (run_dir / "_meta.json").write_text(
        json.dumps({"started_at": _now(), "personas": [p.id for p in personas], **(meta or {})}, indent=2),
        encoding="utf-8",
    )
    lock = threading.Lock()
    records: list[RunRecord] = []

    def one(persona: Persona) -> RunRecord:
        log.info("running persona %s", persona.id)
        record = runner.run_persona(persona)
        with lock:
            write_record(run_dir, record)
            records.append(record)
        log.info("persona %s -> %s in %d turns (%.0fs)", persona.id, record.outcome, len(record.turns), record.wall_time_s)
        return record

    if parallel <= 1:
        for persona in personas:
            one(persona)
    else:
        with ThreadPoolExecutor(max_workers=parallel) as pool:
            list(pool.map(one, personas))
    return sorted(records, key=lambda r: r.persona_id)
