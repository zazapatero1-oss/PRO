"""Shared pydantic models: personas, API shapes, SSE events and run records."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Severity = Literal["none", "mild", "moderate", "severe"]
GroundTruthSeverity = Literal["none", "mild", "moderate", "severe", "declined"]
SEVERITY_LEVELS: dict[str, int] = {"none": 0, "mild": 1, "moderate": 2, "severe": 3}


# --------------------------------------------------------------------------- personas


class Intake(BaseModel):
    display_name: str
    preferred_language: Literal["en", "es"]
    age_band: Literal["under-8", "8-12", "13-17", "18-29", "30-49", "50-69", "70-plus"]
    reading_comfort: Literal["short-messages", "comfortable", "prefer-voice"]
    diagnosis_code: str
    diagnosis_text: str


class ClinicianNote(BaseModel):
    note: str
    focus_constructs: list[str] = Field(default_factory=list)


class Personality(BaseModel):
    style: str
    description: str
    switch_language_to: Literal["en", "es"] | None = None
    switch_at_turn: int | None = None


class SafetySpec(BaseModel):
    introduce_at_turn: int = Field(ge=1)
    ideation_text: str


class NarrativeFact(BaseModel):
    text: str
    construct_id: str | None = None
    match_any: list[str] = Field(min_length=1)


class GroundTruth(BaseModel):
    constructs: dict[str, GroundTruthSeverity]
    narrative_facts: list[NarrativeFact]


class SummaryCorrection(BaseModel):
    construct_id: str | None = None
    patient_text: str


class ExpectedBehaviours(BaseModel):
    declines: list[str] = Field(default_factory=list)
    decline_keywords: list[str] = Field(default_factory=list)
    asks_medical_question: bool = False
    medical_question: str | None = None
    medical_question_keywords: list[str] = Field(default_factory=list)
    safety_intercept_expected: bool = False
    summary_correction: SummaryCorrection | None = None


class Persona(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    language: Literal["en", "es"]
    population: Literal["adult", "pediatric"]
    speaker: Literal["self", "guardian", "both"]
    intake: Intake
    timepoint: Literal[
        "baseline", "pre-op", "post-op-2w", "post-op-6w", "post-op-6m", "post-op-12m", "follow-up"
    ]
    respondent: Literal["self", "guardian", "both"]
    clinician_note: ClinicianNote | None = None
    personality: Personality
    backstory: str
    safety: SafetySpec | None = None
    ground_truth: GroundTruth
    expected_behaviours: ExpectedBehaviours

    @model_validator(mode="after")
    def _consistency(self) -> "Persona":
        if self.language != self.intake.preferred_language:
            raise ValueError(f"{self.id}: language must equal intake.preferred_language")
        if self.population == "pediatric" and self.respondent == "self":
            raise ValueError(f"{self.id}: pediatric personas must use respondent guardian/both")
        if self.population == "pediatric" and self.speaker == "self":
            raise ValueError(f"{self.id}: pediatric personas must be spoken by the guardian")
        if self.population == "adult" and self.intake.age_band in ("under-8", "8-12", "13-17"):
            raise ValueError(f"{self.id}: adult persona with a pediatric age band")
        if self.expected_behaviours.safety_intercept_expected != (self.safety is not None):
            raise ValueError(f"{self.id}: safety block must be present iff safety_intercept_expected")
        for cid in self.expected_behaviours.declines:
            if self.ground_truth.constructs.get(cid) != "declined":
                raise ValueError(f"{self.id}: declined construct {cid} must be 'declined' in ground truth")
        for cid, sev in self.ground_truth.constructs.items():
            if sev == "declined" and cid not in self.expected_behaviours.declines:
                raise ValueError(f"{self.id}: {cid} is 'declined' in ground truth but not in declines")
        n = len(self.ground_truth.constructs)
        if not 8 <= n <= 16:
            raise ValueError(f"{self.id}: expected 8-16 ground-truth constructs, got {n}")
        nf = len(self.ground_truth.narrative_facts)
        if not 3 <= nf <= 6:
            raise ValueError(f"{self.id}: expected 3-6 narrative facts, got {nf}")
        if self.expected_behaviours.asks_medical_question and not self.expected_behaviours.medical_question:
            raise ValueError(f"{self.id}: asks_medical_question requires medical_question text")
        return self


class ConstructIdEntry(BaseModel):
    label: str
    patient_topic: str
    patient_topic_es: str | None = None


class ConstructRegistry(BaseModel):
    constructs: dict[str, ConstructIdEntry]


# --------------------------------------------------------------------------- SSE events


class TokenEvent(BaseModel):
    event: Literal["token"] = "token"
    t: str


class EvidenceEvent(BaseModel):
    event: Literal["evidence"] = "evidence"
    construct_id: str
    severity: str
    confidence: float | None = None


class Coverage(BaseModel):
    covered: int
    total_active: int


class StatusEvent(BaseModel):
    event: Literal["status"] = "status"
    coverage: Coverage
    turns_used: int
    max_turns: int


class SafetyEvent(BaseModel):
    event: Literal["safety"] = "safety"
    message: str


class EndedEvent(BaseModel):
    event: Literal["ended"] = "ended"
    reason: str


class ErrorEvent(BaseModel):
    event: Literal["error"] = "error"
    retryable: bool = False
    message: str = ""


class UnknownEvent(BaseModel):
    event: str
    data: Any = None


SSEEvent = TokenEvent | EvidenceEvent | StatusEvent | SafetyEvent | EndedEvent | ErrorEvent | UnknownEvent


# --------------------------------------------------------------------------- API shapes


class StartSessionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    session_id: str
    participant_id: str
    study_id: str | None = None
    resume_token: str
    patient_link_path: str | None = None


class SessionMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    seq: int
    role: str
    content: str
    created_at: str | None = None


class SessionState(BaseModel):
    model_config = ConfigDict(extra="allow")
    session_id: str
    status: str
    language: str | None = None
    respondent: str | None = None
    timepoint: str | None = None
    consent_variant_needed: str | None = None
    messages: list[SessionMessage] = Field(default_factory=list)
    coverage: Coverage | None = None
    turns_used: int | None = None
    max_turns: int | None = None
    patient_summary: str | None = None


# --------------------------------------------------------------------------- run records


class TurnRecord(BaseModel):
    """One assistant turn: what the patient said (None for the opening) and what came back."""

    turn: int
    patient_text: str | None
    input_mode: str | None
    assistant_text: str
    events: list[dict[str, Any]]
    retried: bool = False
    latency_s: float = 0.0
    patient_input_tokens: int = 0
    patient_output_tokens: int = 0


class RunRecord(BaseModel):
    persona_id: str
    started_at: str
    finished_at: str | None = None
    wall_time_s: float = 0.0
    session_id: str | None = None
    participant_id: str | None = None
    study_id: str | None = None
    consent_variant: str | None = None
    turns: list[TurnRecord] = Field(default_factory=list)
    outcome: Literal["ended", "safety", "max_turns", "error"] = "error"
    ended_reason: str | None = None
    safety_message: str | None = None
    patient_summary: str | None = None
    correction_submitted: dict[str, Any] | None = None
    profile: dict[str, Any] | None = None
    profile_meta: dict[str, Any] | None = None
    session_row: dict[str, Any] | None = None
    final_status: str | None = None
    error: str | None = None
    patient_model: str | None = None
    patient_tokens: dict[str, int] = Field(default_factory=lambda: {"input": 0, "output": 0})

    @property
    def assistant_turn_count(self) -> int:
        return len(self.turns)
