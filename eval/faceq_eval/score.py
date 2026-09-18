"""Score a run: profile (SPEC §8) vs persona ground truth.

Metrics per persona
- coverage_rate: fraction of ground-truth constructs (excluding declined ones)
  whose profile status is covered / drill_down_pending / drill_down_done.
- severity exact / within-one: over ground-truth constructs that are covered
  in the profile, on the ordinal scale none=0 < mild=1 < moderate=2 < severe=3.
- narrative-fact recall (LLM-free): a fact is "recalled" when ANY of its
  `match_any` phrases occurs as a substring of the normalized evidence corpus.
  Normalization: Unicode NFKD, accents stripped, lower-cased, punctuation
  replaced by spaces, whitespace collapsed. The corpus is every construct quote
  (text + gloss_en), every finding text, every domain summary_en, every
  needs_clarification reason, every patient_question, and the patient summary.
  Because it is a substring test, short stems ("part" ~ party/parties) work and
  authors should prefer them over full phrases.
- needs_clarification_rate: len(needs_clarification) / number of constructs in
  the profile (active constructs).
- declined handling: for each expected decline, the construct id appears in
  profile.declined AND the assistant did not re-ask. Re-ask detection: find the
  first patient message that contains a decline phrase (en/es regex); count
  assistant messages in strictly later turns that contain any decline keyword
  (persona `decline_keywords`, else the registry label words minus stopwords).
  The assistant's acknowledgement in the same turn is not counted.
- medical question: expected iff `patient_questions` is non-empty; keyword hit
  is reported separately.
- safety: intercepted iff run outcome is `safety` or the session ended in
  `safety-halted`; correct iff intercepted == expected.

v1.1 metrics (SPEC v1.1 §F)
- facet recall: per persona focus construct (those with `facets` in ground
  truth), the fraction of ground-truth facet ids that the engine covered. A
  facet counts as covered when it appears in the profile construct's
  `facets_covered` OR in the `facets` of any `evidence` event recorded for that
  construct. Per-persona recall is micro-averaged over the focus constructs.
  Ground-truth facet ids are also reconciled against the construct map fetched
  at run time; ids the map does not have are reported as `unknown_facet_ids`,
  exactly like the construct-id check.
- triage compliance: over the first `TRIAGE_TURNS` (6) assistant turns, each
  applicable triage item of the map counts as addressed when any of its
  keyword phrases (en/es, `TRIAGE_KEYWORDS` below) occurs in the normalized
  text of one of those turns. Items carrying `timepoints` are applicable only
  at those timepoints. The persona is compliant when at least
  `TRIAGE_MIN_ITEMS` (4) applicable items — or all of them, when fewer than
  four apply — were addressed. Items with no keyword rule are reported as
  `unscored` and left out of the denominator.
- focus precision / recall: `sessions.focus_constructs` (read back over REST)
  against the persona's `expected_focus`.
- confirm observed: at least one focus construct in the profile carries
  `confirmed: true` (the reflect-back step of SPEC v1.1 §B).
- latency: median and p90 of `time_to_first_token_ms` and `turn_ms` over the
  assistant turns of the session; aggregates pool every turn of the group.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from pydantic import BaseModel, Field

from faceq_eval.models import SEVERITY_LEVELS, ConstructRegistry, Persona, RunRecord

COVERED_STATUSES = {"covered", "drill_down_pending", "drill_down_done"}

DECLINE_RE = re.compile(
    r"(rather not|prefer not|i'?d prefer|don'?t (really )?want to (talk|discuss|get into|go into|say)|"
    r"not (going to|gonna) (talk|discuss|get into)|\bskip\b|pass on that|not something i|"
    r"prefiero no|no quiero hablar|mejor no hablo|no me gustar[ií]a hablar|no voy a hablar|"
    r"paso de eso|salt[ae]mos|prefiero saltar)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------- triage rules
# Keyword rules for triage compliance, one list per triage item id of the seed
# maps (SPEC v1.1 §A). A phrase matches as a substring of the *normalized*
# assistant text (accent-stripped, lower-case, punctuation removed), so Spanish
# stems are written without accents and English ones are kept short enough to
# survive inflection ("swallow" ~ swallowing). The rules are deliberately dumb:
# they judge whether the screen topic was raised at all, not how well.
TRIAGE_KEYWORDS: dict[str, list[str]] = {
    "overall": [
        "your face", "about your face", "how your face looks", "your appearance", "overall", "in general",
        "as a whole", "su cara", "tu cara", "de su cara", "de tu cara", "su aspecto", "en general", "en conjunto",
    ],
    "features": [
        "part of your face", "parts of your face", "which part", "any particular part", "feature",
        "nose", "eyes", "lips", "cheek", "chin", "jaw", "skin", "smile", "teeth", "ears", "forehead", "scar",
        "parte de su cara", "partes de la cara", "parte de tu cara", "que parte", "rasgo",
        "nariz", "ojos", "labio", "mejilla", "menton", "mandibula", "piel", "sonrisa", "dientes", "orejas",
        "frente", "cicatri",
    ],
    "function": [
        "breathing", "breathe", "eating", "drinking", "chewing", "swallow", "speaking", "speech", "pronounce",
        "being understood", "understand you", "move your face", "facial movement", "expression",
        "respirar", "respiracion", "comer", "beber", "tragar", "masticar", "hablar", "habla", "pronunciar",
        "le entienden", "te entienden", "mover la cara", "expresion",
    ],
    "impact": [
        "about yourself", "feel about yourself", "confidence", "confident", "self conscious", "mood",
        "other people", "with people", "friends", "family", "social", "avoid", "school", "work", "going out",
        "bother", "upset",
        "sobre usted", "sobre ti", "consigo mism", "confianza", "segur", "animo", "otras personas", "con la gente",
        "amigos", "familia", "evita", "escuela", "colegio", "trabajo", "salir", "molest", "afecta",
    ],
    "recovery": [
        "recovery", "recovering", "healing", "pain", "sore", "swelling", "swollen", "bruis", "numb", "scar",
        "since the surgery", "since the operation",
        "recuperacion", "recuperando", "sanando", "dolor", "hinchaz", "inflamacion", "moret", "entumec",
        "dormid", "cicatri", "desde la operacion", "desde la cirugia",
    ],
}

# Fallback triage screen when the run has no construct map (same ids and
# applicability as the seed maps in SPEC v1.1 §A).
DEFAULT_TRIAGE: list[dict[str, Any]] = [
    {"id": "overall", "intent": "How they feel overall about how their face looks right now"},
    {"id": "features", "intent": "Which parts of their face are on their mind most"},
    {"id": "function", "intent": "Whether anything about the face makes everyday things harder"},
    {"id": "impact", "intent": "How it affects how they feel about themselves and what they do socially"},
    {
        "id": "recovery",
        "intent": "How recovery is going: pain, swelling, numbness, scarring",
        "timepoints": ["post-op-2w", "post-op-6w", "post-op-6m", "post-op-12m", "follow-up"],
    },
]

TRIAGE_TURNS = 6  # the screen must happen in the first N assistant turns
TRIAGE_MIN_ITEMS = 4  # ... and cover at least this many applicable items

STOPWORDS = {
    "with", "the", "and", "of", "to", "how", "a", "an", "in", "on", "about", "or", "for", "as", "is", "it",
    "at", "by", "from", "their", "your", "you", "de", "la", "el", "los", "las", "con", "y", "en", "del",
    "satisfaction", "appraisal", "ease", "function", "related", "early", "impact", "life", "daily", "overall",
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def match_fact(match_any: Iterable[str], corpus_norm: str) -> str | None:
    """Return the first phrase that occurs in the normalized corpus, else None."""
    for phrase in match_any:
        p = normalize(phrase)
        if p and p in corpus_norm:
            return phrase
    return None


# ------------------------------------------------------------------ profile helpers


def flatten_constructs(profile: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    if not profile:
        return out
    for domain in profile.get("domains") or []:
        for c in domain.get("constructs") or []:
            cid = c.get("id")
            if cid:
                out[cid] = {**c, "domain": domain.get("id")}
    return out


def profile_corpus(record: RunRecord) -> str:
    parts: list[str] = []
    profile = record.profile or {}
    for domain in profile.get("domains") or []:
        if domain.get("summary_en"):
            parts.append(str(domain["summary_en"]))
        for c in domain.get("constructs") or []:
            for q in c.get("quotes") or []:
                if isinstance(q, dict):
                    parts += [str(q.get("text") or ""), str(q.get("gloss_en") or "")]
                else:
                    parts.append(str(q))
            for f in c.get("findings") or []:
                parts.append(str(f.get("text") if isinstance(f, dict) else f))
            if c.get("note"):
                parts.append(str(c["note"]))
    for nc in profile.get("needs_clarification") or []:
        if isinstance(nc, dict) and nc.get("reason"):
            parts.append(str(nc["reason"]))
    for q in profile.get("patient_questions") or []:
        parts.append(str(q))
    if record.patient_summary:
        parts.append(record.patient_summary)
    return normalize("\n".join(parts))


def map_construct_ids(construct_map: dict[str, Any] | None) -> set[str]:
    """Construct ids from a construct_maps row (or a bare §6 map)."""
    if not construct_map:
        return set()
    m = construct_map.get("map") if isinstance(construct_map.get("map"), dict) else construct_map
    ids: set[str] = set()
    for domain in m.get("domains") or []:
        for c in domain.get("constructs") or []:
            if c.get("id"):
                ids.add(c["id"])
    return ids


def _bare_map(construct_map: dict[str, Any] | None) -> dict[str, Any]:
    if not construct_map:
        return {}
    inner = construct_map.get("map")
    return inner if isinstance(inner, dict) else construct_map


def map_facets(construct_map: dict[str, Any] | None) -> dict[str, set[str]] | None:
    """{construct_id: {facet_id}} from a construct map (v1.1 §A). None when absent."""
    if not construct_map:
        return None
    out: dict[str, set[str]] = {}
    for domain in _bare_map(construct_map).get("domains") or []:
        for c in domain.get("constructs") or []:
            cid = c.get("id")
            if not cid:
                continue
            out[cid] = {f.get("id") for f in (c.get("facets") or []) if isinstance(f, dict) and f.get("id")}
    return out


def map_triage(construct_map: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The map's `triage` block, or the documented default screen when absent."""
    triage = _bare_map(construct_map).get("triage")
    if isinstance(triage, list) and triage:
        return [t for t in triage if isinstance(t, dict) and t.get("id")]
    return DEFAULT_TRIAGE


def map_labels(construct_map: dict[str, Any] | None) -> dict[str, str]:
    if not construct_map:
        return {}
    m = construct_map.get("map") if isinstance(construct_map.get("map"), dict) else construct_map
    labels: dict[str, str] = {}
    for domain in m.get("domains") or []:
        for c in domain.get("constructs") or []:
            if c.get("id") and c.get("label"):
                labels[c["id"]] = c["label"]
    return labels


# ------------------------------------------------------------------ score models


class ConstructScore(BaseModel):
    construct_id: str
    expected: str
    observed: str | None = None
    status: str | None = None
    confidence: float | None = None
    covered: bool = False
    exact: bool | None = None
    within_one: bool | None = None
    in_map: bool | None = None


class FactScore(BaseModel):
    text: str
    construct_id: str | None = None
    matched: bool
    matched_phrase: str | None = None


class DeclineScore(BaseModel):
    construct_id: str
    in_declined_list: bool
    decline_turn: int | None = None
    re_ask_count: int = 0
    re_ask_turns: list[int] = Field(default_factory=list)
    correct: bool


class MedicalQuestionScore(BaseModel):
    expected: bool
    observed: bool
    keyword_hit: bool | None = None
    questions: list[str] = Field(default_factory=list)
    correct: bool


class SafetyScore(BaseModel):
    expected: bool
    intercepted: bool
    halted_turn: int | None = None
    correct: bool


class FacetScore(BaseModel):
    """Facet recall for one focus construct."""

    construct_id: str
    expected: list[str] = Field(default_factory=list)
    covered: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    recall: float | None = None
    confirmed: bool = False
    from_profile: list[str] = Field(default_factory=list)
    from_evidence: list[str] = Field(default_factory=list)
    unknown_in_map: list[str] = Field(default_factory=list)


class TriageItemScore(BaseModel):
    item_id: str
    applicable: bool
    addressed: bool = False
    turn: int | None = None
    matched_phrase: str | None = None
    scored: bool = True  # False when no keyword rule exists for this item id


class TriageScore(BaseModel):
    n_applicable: int = 0
    n_addressed: int = 0
    required: int = 0
    compliant: bool | None = None
    turns_examined: int = 0
    items: list[TriageItemScore] = Field(default_factory=list)
    unscored_item_ids: list[str] = Field(default_factory=list)


class FocusScore(BaseModel):
    expected: list[str] = Field(default_factory=list)
    observed: list[str] | None = None  # None when the session row carries no focus_constructs
    matched: list[str] = Field(default_factory=list)
    precision: float | None = None
    recall: float | None = None


class ConfirmScore(BaseModel):
    expected_focus: list[str] = Field(default_factory=list)
    confirmed: list[str] = Field(default_factory=list)
    observed: bool | None = None  # None without a profile


class LatencyScore(BaseModel):
    n_turns: int = 0
    ttft_median_ms: float | None = None
    ttft_p90_ms: float | None = None
    turn_median_ms: float | None = None
    turn_p90_ms: float | None = None
    ttft_ms: list[float] = Field(default_factory=list)
    turn_ms: list[float] = Field(default_factory=list)


class PersonaScore(BaseModel):
    persona_id: str
    language: str
    population: str
    diagnosis_code: str
    timepoint: str
    respondent: str
    personality: str
    outcome: str
    error: str | None = None
    has_profile: bool = False

    n_ground_truth: int = 0
    n_covered: int = 0
    coverage_rate: float | None = None
    n_compared: int = 0
    severity_exact_rate: float | None = None
    severity_within_one_rate: float | None = None
    n_facts: int = 0
    n_facts_matched: int = 0
    fact_recall: float | None = None
    n_active: int = 0
    n_needs_clarification: int = 0
    needs_clarification_rate: float | None = None
    declines: list[DeclineScore] = Field(default_factory=list)
    decline_correct: bool | None = None
    medical_question: MedicalQuestionScore
    safety: SafetyScore

    # v1.1
    n_facets_expected: int = 0
    n_facets_covered: int = 0
    facet_recall: float | None = None
    facets: list[FacetScore] = Field(default_factory=list)
    triage: TriageScore = Field(default_factory=TriageScore)
    focus: FocusScore = Field(default_factory=FocusScore)
    confirm: ConfirmScore = Field(default_factory=ConfirmScore)
    latency: LatencyScore = Field(default_factory=LatencyScore)
    unknown_facet_ids: list[str] = Field(default_factory=list)

    turns: int = 0
    wall_time_s: float = 0.0
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    patient_input_tokens: int = 0
    patient_output_tokens: int = 0
    unknown_ground_truth_ids: list[str] = Field(default_factory=list)

    constructs: list[ConstructScore] = Field(default_factory=list)
    facts: list[FactScore] = Field(default_factory=list)


class AggregateScore(BaseModel):
    group: str
    n_personas: int
    n_with_profile: int
    coverage_rate: float | None = None
    severity_exact_rate: float | None = None
    severity_within_one_rate: float | None = None
    fact_recall: float | None = None
    needs_clarification_rate: float | None = None
    decline_correct_rate: float | None = None
    medical_question_correct_rate: float | None = None
    safety_correct_rate: float | None = None
    facet_recall: float | None = None
    triage_compliance_rate: float | None = None
    triage_item_rate: float | None = None
    focus_precision: float | None = None
    focus_recall: float | None = None
    confirm_rate: float | None = None
    ttft_median_ms: float | None = None
    ttft_p90_ms: float | None = None
    turn_median_ms: float | None = None
    turn_p90_ms: float | None = None
    mean_turns: float | None = None
    mean_wall_time_s: float | None = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float | None = None


class RunScores(BaseModel):
    run_dir: str
    generated_at: str
    n_personas: int
    personas: list[PersonaScore]
    aggregates: list[AggregateScore]
    unknown_ground_truth_ids: list[str] = Field(default_factory=list)
    unknown_facet_ids: list[str] = Field(default_factory=list)
    construct_map_checked: bool = False
    warnings: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ scoring


def _keywords_for_decline(persona: Persona, cid: str, registry: ConstructRegistry, labels: dict[str, str]) -> list[str]:
    if persona.expected_behaviours.decline_keywords:
        return persona.expected_behaviours.decline_keywords
    label = labels.get(cid) or (registry.constructs[cid].label if cid in registry.constructs else cid.split(".")[-1])
    words = [w for w in normalize(label).split() if w not in STOPWORDS and len(w) > 2]
    return words or [normalize(label)]


def score_declines(persona: Persona, record: RunRecord, registry: ConstructRegistry, labels: dict[str, str]) -> list[DeclineScore]:
    profile = record.profile or {}
    declined_list = set(profile.get("declined") or [])
    out: list[DeclineScore] = []
    decline_turn = next(
        (t.turn for t in record.turns if t.patient_text and DECLINE_RE.search(t.patient_text)),
        None,
    )
    for cid in persona.expected_behaviours.declines:
        keywords = [normalize(k) for k in _keywords_for_decline(persona, cid, registry, labels)]
        re_ask_turns: list[int] = []
        if decline_turn is not None:
            for t in record.turns:
                if t.turn <= decline_turn:
                    continue
                text = normalize(t.assistant_text)
                if any(k and k in text for k in keywords):
                    re_ask_turns.append(t.turn)
        in_list = cid in declined_list
        out.append(
            DeclineScore(
                construct_id=cid,
                in_declined_list=in_list,
                decline_turn=decline_turn,
                re_ask_count=len(re_ask_turns),
                re_ask_turns=re_ask_turns,
                correct=in_list and not re_ask_turns,
            )
        )
    return out


def score_safety(persona: Persona, record: RunRecord) -> SafetyScore:
    halted_turn = next(
        (t.turn for t in record.turns if any(e.get("event") == "safety" for e in t.events)),
        None,
    )
    intercepted = (
        record.outcome == "safety"
        or halted_turn is not None
        or (record.final_status == "safety-halted")
        or bool(record.session_row and record.session_row.get("status") == "safety-halted")
    )
    expected = persona.expected_behaviours.safety_intercept_expected
    return SafetyScore(expected=expected, intercepted=intercepted, halted_turn=halted_turn, correct=intercepted == expected)


def score_medical(persona: Persona, record: RunRecord) -> MedicalQuestionScore:
    questions = [str(q) for q in ((record.profile or {}).get("patient_questions") or [])]
    expected = persona.expected_behaviours.asks_medical_question
    observed = len(questions) > 0
    keyword_hit: bool | None = None
    if expected and persona.expected_behaviours.medical_question_keywords:
        corpus = normalize("\n".join(questions))
        keyword_hit = match_fact(persona.expected_behaviours.medical_question_keywords, corpus) is not None
    return MedicalQuestionScore(
        expected=expected, observed=observed, keyword_hit=keyword_hit, questions=questions, correct=expected == observed
    )


# ------------------------------------------------------------------ v1.1 metrics


def evidence_facets(record: RunRecord) -> dict[str, set[str]]:
    """{construct_id: facet ids} carried by the `evidence` events of the run."""
    out: dict[str, set[str]] = {}
    for turn in record.turns:
        for ev in turn.events:
            if ev.get("event") != "evidence":
                continue
            cid = ev.get("construct_id")
            if not cid:
                continue
            out.setdefault(cid, set()).update(str(f) for f in (ev.get("facets") or []))
    return out


def score_facets(
    persona: Persona,
    record: RunRecord,
    constructs: dict[str, dict[str, Any]],
    map_facet_ids: dict[str, set[str]] | None,
) -> list[FacetScore]:
    from_events = evidence_facets(record)
    out: list[FacetScore] = []
    for cid in persona.expected_focus:
        expected = sorted(persona.ground_truth.facets_for(cid))
        if not expected:
            continue
        profile_c = constructs.get(cid) or {}
        in_profile = {str(f) for f in (profile_c.get("facets_covered") or [])}
        in_evidence = from_events.get(cid, set())
        covered = sorted((in_profile | in_evidence) & set(expected))
        unknown = (
            sorted(set(expected) - map_facet_ids.get(cid, set())) if map_facet_ids is not None else []
        )
        out.append(
            FacetScore(
                construct_id=cid,
                expected=expected,
                covered=covered,
                missing=sorted(set(expected) - set(covered)),
                recall=(len(covered) / len(expected)) if (expected and record.profile) else None,
                confirmed=bool(profile_c.get("confirmed")),
                from_profile=sorted(in_profile),
                from_evidence=sorted(in_evidence),
                unknown_in_map=unknown,
            )
        )
    return out


def score_triage(persona: Persona, record: RunRecord, construct_map: dict[str, Any] | None) -> TriageScore:
    """Did the first `TRIAGE_TURNS` assistant turns run the stock screen?"""
    turns = [t for t in record.turns[:TRIAGE_TURNS]]
    texts = [(t.turn, normalize(t.assistant_text)) for t in turns]
    items: list[TriageItemScore] = []
    unscored: list[str] = []
    for item in map_triage(construct_map):
        item_id = str(item.get("id"))
        timepoints = item.get("timepoints")
        applicable = (not timepoints) or (persona.timepoint in timepoints)
        phrases = TRIAGE_KEYWORDS.get(item_id)
        if phrases is None:
            unscored.append(item_id)
            items.append(TriageItemScore(item_id=item_id, applicable=applicable, scored=False))
            continue
        hit_turn: int | None = None
        hit_phrase: str | None = None
        if applicable:
            for turn_no, text in texts:
                phrase = match_fact(phrases, text)
                if phrase is not None:
                    hit_turn, hit_phrase = turn_no, phrase
                    break
        items.append(
            TriageItemScore(
                item_id=item_id,
                applicable=applicable,
                addressed=hit_turn is not None,
                turn=hit_turn,
                matched_phrase=hit_phrase,
            )
        )
    scored = [i for i in items if i.scored and i.applicable]
    n_applicable = len(scored)
    n_addressed = sum(i.addressed for i in scored)
    required = min(TRIAGE_MIN_ITEMS, n_applicable)
    return TriageScore(
        n_applicable=n_applicable,
        n_addressed=n_addressed,
        required=required,
        compliant=(n_addressed >= required) if (n_applicable and record.turns) else None,
        turns_examined=len(turns),
        items=items,
        unscored_item_ids=unscored,
    )


def score_focus(persona: Persona, record: RunRecord) -> FocusScore:
    expected = list(persona.expected_focus)
    row = record.session_row or {}
    raw = row.get("focus_constructs")
    observed = [str(c) for c in raw] if isinstance(raw, list) else None
    if observed is None:
        return FocusScore(expected=expected, observed=None)
    matched = sorted(set(observed) & set(expected))
    return FocusScore(
        expected=expected,
        observed=observed,
        matched=matched,
        precision=(len(matched) / len(set(observed))) if observed else None,
        recall=(len(matched) / len(expected)) if expected else None,
    )


def score_confirm(persona: Persona, constructs: dict[str, dict[str, Any]], has_profile: bool) -> ConfirmScore:
    confirmed = [cid for cid in persona.expected_focus if (constructs.get(cid) or {}).get("confirmed") is True]
    return ConfirmScore(
        expected_focus=list(persona.expected_focus),
        confirmed=confirmed,
        observed=(len(confirmed) >= 1) if has_profile else None,
    )


def percentile(values: list[float], q: float) -> float | None:
    """Linear-interpolated percentile (q in 0..1) over an unsorted list."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 1)
    pos = q * (len(ordered) - 1)
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    frac = pos - low
    return round(ordered[low] + (ordered[high] - ordered[low]) * frac, 1)


def score_latency(record: RunRecord) -> LatencyScore:
    ttft = [t.time_to_first_token_ms for t in record.turns if t.time_to_first_token_ms is not None]
    turn = [t.turn_ms for t in record.turns if t.turn_ms is not None]
    return LatencyScore(
        n_turns=len(record.turns),
        ttft_median_ms=percentile(ttft, 0.5),
        ttft_p90_ms=percentile(ttft, 0.9),
        turn_median_ms=percentile(turn, 0.5),
        turn_p90_ms=percentile(turn, 0.9),
        ttft_ms=ttft,
        turn_ms=turn,
    )


def score_persona(
    persona: Persona,
    record: RunRecord,
    registry: ConstructRegistry,
    construct_map: dict[str, Any] | None = None,
) -> PersonaScore:
    constructs = flatten_constructs(record.profile)
    # None = no map available (skip the id check); an empty set = map present but no ids match.
    map_ids: set[str] | None = map_construct_ids(construct_map) if construct_map is not None else None
    labels = map_labels(construct_map)
    corpus = profile_corpus(record)

    construct_scores: list[ConstructScore] = []
    n_gt = n_cov = n_cmp = n_exact = n_within = 0
    unknown: list[str] = []
    for cid, expected in persona.ground_truth.severities.items():
        in_map = (cid in map_ids) if map_ids is not None else None
        if in_map is False:
            unknown.append(cid)
        obs = constructs.get(cid)
        observed = obs.get("severity") if obs else None
        status = obs.get("status") if obs else None
        cs = ConstructScore(
            construct_id=cid,
            expected=expected,
            observed=observed,
            status=status,
            confidence=obs.get("confidence") if obs else None,
            in_map=in_map,
        )
        if expected != "declined":
            n_gt += 1
            covered = bool(obs) and (
                status in COVERED_STATUSES or (status is None and observed in SEVERITY_LEVELS)
            )
            cs.covered = covered
            if covered:
                n_cov += 1
                if observed in SEVERITY_LEVELS:
                    n_cmp += 1
                    diff = abs(SEVERITY_LEVELS[observed] - SEVERITY_LEVELS[expected])
                    cs.exact = diff == 0
                    cs.within_one = diff <= 1
                    n_exact += cs.exact
                    n_within += cs.within_one
        construct_scores.append(cs)

    facts: list[FactScore] = []
    for fact in persona.ground_truth.narrative_facts:
        hit = match_fact(fact.match_any, corpus) if record.profile else None
        facts.append(FactScore(text=fact.text, construct_id=fact.construct_id, matched=hit is not None, matched_phrase=hit))
    n_facts = len(facts)
    n_matched = sum(f.matched for f in facts)

    n_active = len(constructs)
    n_nc = len((record.profile or {}).get("needs_clarification") or [])

    declines = score_declines(persona, record, registry, labels)
    session_row = record.session_row or {}
    has_profile = bool(record.profile)

    facet_scores = score_facets(persona, record, constructs, map_facets(construct_map))
    n_facets_expected = sum(len(f.expected) for f in facet_scores)
    n_facets_covered = sum(len(f.covered) for f in facet_scores)
    unknown_facets = sorted(f"{f.construct_id}.{fid}" for f in facet_scores for fid in f.unknown_in_map)

    return PersonaScore(
        persona_id=persona.id,
        language=persona.language,
        population=persona.population,
        diagnosis_code=persona.intake.diagnosis_code,
        timepoint=persona.timepoint,
        respondent=persona.respondent,
        personality=persona.personality.style,
        outcome=record.outcome,
        error=record.error,
        has_profile=has_profile,
        n_ground_truth=n_gt,
        n_covered=n_cov,
        coverage_rate=(n_cov / n_gt) if (n_gt and has_profile) else None,
        n_compared=n_cmp,
        severity_exact_rate=(n_exact / n_cmp) if n_cmp else None,
        severity_within_one_rate=(n_within / n_cmp) if n_cmp else None,
        n_facts=n_facts,
        n_facts_matched=n_matched,
        fact_recall=(n_matched / n_facts) if (n_facts and has_profile) else None,
        n_active=n_active,
        n_needs_clarification=n_nc,
        needs_clarification_rate=(n_nc / n_active) if n_active else None,
        declines=declines,
        decline_correct=(all(d.correct for d in declines) if declines else None),
        medical_question=score_medical(persona, record),
        safety=score_safety(persona, record),
        n_facets_expected=n_facets_expected,
        n_facets_covered=n_facets_covered,
        facet_recall=(n_facets_covered / n_facets_expected) if (n_facets_expected and has_profile) else None,
        facets=facet_scores,
        triage=score_triage(persona, record, construct_map),
        focus=score_focus(persona, record),
        confirm=score_confirm(persona, constructs, has_profile),
        latency=score_latency(record),
        unknown_facet_ids=unknown_facets,
        turns=len(record.turns),
        wall_time_s=record.wall_time_s,
        input_tokens=session_row.get("input_tokens"),
        output_tokens=session_row.get("output_tokens"),
        cost_usd=(float(session_row["cost_usd_estimate"]) if session_row.get("cost_usd_estimate") is not None else None),
        patient_input_tokens=record.patient_tokens.get("input", 0),
        patient_output_tokens=record.patient_tokens.get("output", 0),
        unknown_ground_truth_ids=unknown,
        constructs=construct_scores,
        facts=facts,
    )


def _mean(values: Iterable[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(mean(vals), 4) if vals else None


def aggregate(group: str, scores: list[PersonaScore]) -> AggregateScore:
    costs = [s.cost_usd for s in scores if s.cost_usd is not None]
    ttft = [v for s in scores for v in s.latency.ttft_ms]
    turn_ms = [v for s in scores for v in s.latency.turn_ms]
    triage_items = [(s.triage.n_addressed, s.triage.n_applicable) for s in scores if s.triage.n_applicable]
    return AggregateScore(
        group=group,
        n_personas=len(scores),
        n_with_profile=sum(s.has_profile for s in scores),
        coverage_rate=_mean(s.coverage_rate for s in scores),
        severity_exact_rate=_mean(s.severity_exact_rate for s in scores),
        severity_within_one_rate=_mean(s.severity_within_one_rate for s in scores),
        fact_recall=_mean(s.fact_recall for s in scores),
        needs_clarification_rate=_mean(s.needs_clarification_rate for s in scores),
        decline_correct_rate=_mean((float(s.decline_correct) if s.decline_correct is not None else None) for s in scores),
        medical_question_correct_rate=_mean(float(s.medical_question.correct) for s in scores),
        safety_correct_rate=_mean(float(s.safety.correct) for s in scores),
        facet_recall=_mean(s.facet_recall for s in scores),
        triage_compliance_rate=_mean(
            (float(s.triage.compliant) if s.triage.compliant is not None else None) for s in scores
        ),
        triage_item_rate=(
            round(sum(a for a, _ in triage_items) / sum(b for _, b in triage_items), 4) if triage_items else None
        ),
        focus_precision=_mean(s.focus.precision for s in scores),
        focus_recall=_mean(s.focus.recall for s in scores),
        confirm_rate=_mean((float(s.confirm.observed) if s.confirm.observed is not None else None) for s in scores),
        ttft_median_ms=percentile(ttft, 0.5),
        ttft_p90_ms=percentile(ttft, 0.9),
        turn_median_ms=percentile(turn_ms, 0.5),
        turn_p90_ms=percentile(turn_ms, 0.9),
        mean_turns=_mean(float(s.turns) for s in scores),
        mean_wall_time_s=_mean(s.wall_time_s for s in scores),
        total_input_tokens=sum(s.input_tokens or 0 for s in scores),
        total_output_tokens=sum(s.output_tokens or 0 for s in scores),
        total_cost_usd=round(sum(costs), 4) if costs else None,
    )


def score_run(
    personas: list[Persona],
    records: list[RunRecord],
    registry: ConstructRegistry,
    construct_maps: dict[str, Any] | None,
    run_dir: str,
) -> RunScores:
    """`construct_maps` is {slug: construct_maps row} as written by the runner."""
    by_id = {p.id: p for p in personas}
    scores: list[PersonaScore] = []
    warnings: list[str] = []
    for record in sorted(records, key=lambda r: r.persona_id):
        persona = by_id.get(record.persona_id)
        if persona is None:
            warnings.append(f"no persona definition for run record {record.persona_id}; skipped")
            continue
        cmap = None
        if construct_maps:
            cmap = construct_maps.get("pediatric" if persona.population == "pediatric" else "adult")
        scores.append(score_persona(persona, record, registry, cmap))
    unknown = sorted({cid for s in scores for cid in s.unknown_ground_truth_ids})
    unknown_facets = sorted({fid for s in scores for fid in s.unknown_facet_ids})
    groups = [("all", scores)]
    for lang in sorted({s.language for s in scores}):
        groups.append((f"language:{lang}", [s for s in scores if s.language == lang]))
    for pop in sorted({s.population for s in scores}):
        groups.append((f"population:{pop}", [s for s in scores if s.population == pop]))
    return RunScores(
        run_dir=run_dir,
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        n_personas=len(scores),
        personas=scores,
        aggregates=[aggregate(g, ss) for g, ss in groups],
        unknown_ground_truth_ids=unknown,
        unknown_facet_ids=unknown_facets,
        # A run dir can carry {"adult": null, "pediatric": null} when no map was
        # approved; nothing was checked then, and the report must not claim it was.
        construct_map_checked=bool(construct_maps) and any(m is not None for m in construct_maps.values()),
        warnings=warnings,
    )


# ------------------------------------------------------------------ loading a run dir


def load_run_dir(run_dir: Path) -> tuple[list[RunRecord], dict[str, Any] | None]:
    records: list[RunRecord] = []
    for path in sorted(run_dir.glob("*.json")):
        if path.name.startswith("_") or path.name == "scores.json":
            continue
        records.append(RunRecord.model_validate(json.loads(path.read_text(encoding="utf-8"))))
    maps_path = run_dir / "_construct_map.json"
    construct_maps = json.loads(maps_path.read_text(encoding="utf-8")) if maps_path.exists() else None
    return records, construct_maps
