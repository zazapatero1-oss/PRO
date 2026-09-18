// Export builders (SPEC §10): FHIR R4 Bundle (collection) and CSV. Pure functions.

import type { ParticipantRow, ProfileJson, SafetyFlagRow, SessionRow } from "./types.ts";

export interface ExportInput {
  participant: ParticipantRow;
  session: SessionRow;
  profile: ProfileJson;
  safetyFlags: SafetyFlagRow[];
}

const CONFIDENCE_EXT_URL = "urn:face-q-conversation:extension:confidence";
const STATUS_EXT_URL = "urn:face-q-conversation:extension:coverage-status";
const SEVERITY_SYSTEM = "urn:face-q-conversation:severity";
const CONSTRUCT_SYSTEM = "urn:face-q-conversation:construct";

type Resource = Record<string, unknown>;

function entry(resource: Resource): { fullUrl: string; resource: Resource } {
  return { fullUrl: `urn:uuid:${resource.id as string}`, resource };
}

const COVERED = new Set(["covered", "drill_down_pending", "drill_down_done"]);

export function buildFhirBundle(input: ExportInput): Resource {
  const { participant, session, profile, safetyFlags } = input;
  const patientId = participant.study_id;
  const encounterId = session.id;

  const patient: Resource = {
    resourceType: "Patient",
    id: patientId,
    identifier: [{ system: "urn:face-q-conversation:study-id", value: participant.study_id }],
    // Pseudonymous by design: display name only, no real name, no birth date.
    name: [{ use: "anonymous", text: participant.display_name }],
    communication: [{
      language: { coding: [{ code: participant.preferred_language }] },
      preferred: true,
    }],
    extension: [
      { url: "urn:face-q-conversation:extension:age-band", valueString: participant.age_band },
      {
        url: "urn:face-q-conversation:extension:diagnosis-code",
        valueString: participant.diagnosis_code,
      },
    ],
  };

  const encounter: Resource = {
    resourceType: "Encounter",
    id: encounterId,
    status: session.status === "completed" ? "finished" : "in-progress",
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "VR",
      display: "virtual",
    },
    type: [{ text: `AI-assisted PRO conversation (${session.timepoint})` }],
    subject: { reference: `Patient/${patientId}` },
    period: {
      start: session.started_at ?? session.created_at,
      ...(session.ended_at ? { end: session.ended_at } : {}),
    },
    extension: [
      { url: "urn:face-q-conversation:extension:timepoint", valueString: session.timepoint },
      { url: "urn:face-q-conversation:extension:respondent", valueString: session.respondent },
      {
        url: "urn:face-q-conversation:extension:prompt-version",
        valueString: session.prompt_version,
      },
      { url: "urn:face-q-conversation:extension:model-id", valueString: session.model_id },
      {
        url: "urn:face-q-conversation:extension:construct-map",
        valueString: profile.generated_with.map,
      },
    ],
  };

  const observations: Resource[] = [];
  for (const d of profile.domains) {
    for (const c of d.constructs) {
      if (!COVERED.has(c.status)) continue;
      observations.push({
        resourceType: "Observation",
        id: `${session.id}-${c.id.replace(/[^A-Za-z0-9.-]/g, "-")}`,
        status: "final",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "survey",
          }],
        }],
        code: { coding: [{ system: CONSTRUCT_SYSTEM, code: c.id }], text: c.label },
        subject: { reference: `Patient/${patientId}` },
        encounter: { reference: `Encounter/${encounterId}` },
        effectiveDateTime: session.ended_at ?? session.created_at,
        valueCodeableConcept: {
          coding: [{ system: SEVERITY_SYSTEM, code: c.severity }],
          text: c.severity,
        },
        note: c.quotes.map((q) => ({
          text: q.gloss_en && q.gloss_en !== q.text ? `${q.text} [en: ${q.gloss_en}]` : q.text,
        })),
        extension: [
          { url: CONFIDENCE_EXT_URL, valueDecimal: c.confidence },
          { url: STATUS_EXT_URL, valueString: c.status },
          { url: "urn:face-q-conversation:extension:domain", valueString: d.id },
        ],
        ...(c.findings.length
          ? {
            component: c.findings.map((f) => ({ code: { text: f.category }, valueString: f.text })),
          }
          : {}),
      });
    }
  }

  const narrative = renderNarrative(profile);
  const composition: Resource = {
    resourceType: "Composition",
    id: `${session.id}-composition`,
    status: "final",
    type: { text: "AI-assisted inferred patient-reported outcome profile" },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    date: session.ended_at ?? session.created_at,
    author: [{
      display: `FACE-Q Conversation (${session.model_id}, prompt ${session.prompt_version})`,
    }],
    title: `Inferred profile — ${session.timepoint}`,
    section: [
      {
        title: "Profile",
        text: {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(narrative)}</div>`,
        },
      },
      {
        title: "Disclaimer",
        text: {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(profile.disclaimer)}</div>`,
        },
      },
    ],
  };

  const flags: Resource[] = safetyFlags.map((f) => ({
    resourceType: "Flag",
    id: f.id,
    status: f.reviewed_at ? "inactive" : "active",
    category: [{ text: "safety" }],
    code: { text: `${f.trigger} (detected by ${f.detected_by})` },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    period: { start: f.created_at },
  }));

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: [patient, encounter, ...observations, composition, ...flags].map(entry),
  };
}

function renderNarrative(profile: ProfileJson): string {
  const lines: string[] = [];
  for (const d of profile.domains) {
    lines.push(`${d.label}: ${d.severity} (confidence ${d.confidence}). ${d.summary_en}`);
  }
  if (profile.needs_clarification.length) {
    lines.push(
      `Needs clarification: ${
        profile.needs_clarification.map((n) => `${n.construct_id} (${n.reason})`).join("; ")
      }`,
    );
  }
  if (profile.declined.length) lines.push(`Declined: ${profile.declined.join(", ")}`);
  if (profile.not_covered.length) lines.push(`Not covered: ${profile.not_covered.join(", ")}`);
  if (profile.patient_questions.length) {
    lines.push(`Patient questions: ${profile.patient_questions.join(" | ")}`);
  }
  if (profile.change_from_prior.length) {
    lines.push(
      `Change from prior: ${
        profile.change_from_prior.map((c) => `${c.construct_id} ${c.prior}→${c.now}`).join(", ")
      }`,
    );
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(
    /\n/g,
    "<br/>",
  );
}

export const CSV_HEADER = [
  "study_id",
  "timepoint",
  "domain",
  "construct",
  "severity",
  "confidence",
  "quote",
  "gloss",
  "findings",
  "status",
] as const;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per active construct. */
export function buildCsv(input: ExportInput): string {
  const rows: string[] = [CSV_HEADER.join(",")];
  for (const d of input.profile.domains) {
    for (const c of d.constructs) {
      rows.push(
        [
          input.participant.study_id,
          input.session.timepoint,
          d.label,
          c.label,
          c.severity,
          c.confidence,
          c.quotes.map((q) => q.text).join(" | "),
          c.quotes.map((q) => q.gloss_en).join(" | "),
          c.findings.map((f) => `${f.category}: ${f.text}`).join(" | "),
          c.status,
        ].map(csvCell).join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}
