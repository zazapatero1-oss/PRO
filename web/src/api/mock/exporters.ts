import type { SessionDetail } from '../../types'
import { findConstruct } from './constructMaps'

// Mock-mode renderings of SPEC §10. The real backend produces these server-side.

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(d: SessionDetail): string {
  const header = ['study_id', 'timepoint', 'domain', 'construct', 'severity', 'confidence', 'quote', 'gloss', 'findings', 'status']
  const rows: string[][] = [header]
  const map = d.construct_map?.map ?? null
  const domains = d.profile?.profile.domains ?? []
  for (const dom of domains)
    for (const c of dom.constructs) {
      const label = findConstruct(map, c.id)?.construct.label ?? c.id
      rows.push([
        d.participant.study_id,
        d.session.timepoint,
        dom.label,
        label,
        c.severity,
        String(c.confidence),
        c.quotes.map((q) => q.text).join(' | '),
        c.quotes.map((q) => q.gloss_en).join(' | '),
        c.findings.map((f) => `${f.category}: ${f.text}`).join(' | '),
        c.status,
      ])
    }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function buildFhirBundle(d: SessionDetail): Record<string, unknown> {
  const map = d.construct_map?.map ?? null
  const patientRef = `Patient/${d.participant.study_id}`
  const encounterRef = `Encounter/${d.session.id}`
  const entries: Record<string, unknown>[] = []

  entries.push({
    fullUrl: `urn:${patientRef}`,
    resource: {
      resourceType: 'Patient',
      id: d.participant.study_id,
      identifier: [{ system: 'urn:face-q-conversation:study-id', value: d.participant.study_id }],
      communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: d.participant.preferred_language }] } }],
      extension: [{ url: 'urn:face-q-conversation:age-band', valueString: d.participant.age_band }],
    },
  })
  entries.push({
    fullUrl: `urn:${encounterRef}`,
    resource: {
      resourceType: 'Encounter',
      id: d.session.id,
      status: d.session.status === 'completed' ? 'finished' : 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' },
      subject: { reference: patientRef },
      period: { start: d.session.started_at ?? undefined, end: d.session.ended_at ?? undefined },
      extension: [
        { url: 'urn:face-q-conversation:timepoint', valueString: d.session.timepoint },
        { url: 'urn:face-q-conversation:prompt-version', valueString: d.session.prompt_version },
        { url: 'urn:face-q-conversation:model-id', valueString: d.session.model_id },
      ],
    },
  })

  const domains = d.profile?.profile.domains ?? []
  for (const dom of domains)
    for (const c of dom.constructs) {
      if (c.status !== 'covered' && c.status !== 'drill_down_done') continue
      const label = findConstruct(map, c.id)?.construct.label ?? c.id
      entries.push({
        fullUrl: `urn:Observation/${d.session.id}-${c.id}`,
        resource: {
          resourceType: 'Observation',
          id: `${d.session.id}-${c.id}`,
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
          code: { text: label },
          subject: { reference: patientRef },
          encounter: { reference: encounterRef },
          effectiveDateTime: d.session.ended_at ?? d.session.created_at,
          valueCodeableConcept: { text: c.severity, coding: [{ system: 'urn:face-q-conversation:severity', code: c.severity }] },
          note: c.quotes.map((q) => ({ text: q.text === q.gloss_en ? q.text : `${q.text} [gloss: ${q.gloss_en}]` })),
          extension: [
            { url: 'urn:face-q-conversation:confidence', valueDecimal: c.confidence },
            { url: 'urn:face-q-conversation:construct-id', valueString: c.id },
            { url: 'urn:face-q-conversation:domain', valueString: dom.id },
          ],
        },
      })
    }

  const narrative = domains
    .map((dom) => `<p><b>${dom.label}</b>: ${dom.severity} (confidence ${dom.confidence}). ${dom.summary_en}</p>`)
    .join('')
  entries.push({
    fullUrl: `urn:Composition/${d.session.id}`,
    resource: {
      resourceType: 'Composition',
      id: d.session.id,
      status: 'final',
      type: { text: 'AI-assisted inferred patient-reported outcome profile' },
      subject: { reference: patientRef },
      encounter: { reference: encounterRef },
      date: d.profile?.generated_at ?? d.session.created_at,
      author: [{ display: 'FACE-Q Conversation (AI-assisted)' }],
      title: `Inferred profile — ${d.session.timepoint}`,
      section: [
        {
          title: 'Disclaimer',
          text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>${d.profile?.profile.disclaimer ?? 'AI-assisted inferred profile. Not a validated FACE-Q score.'}</p></div>` },
        },
        { title: 'Domains', text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${narrative}</div>` } },
      ],
    },
  })

  for (const f of d.safety_flags) {
    entries.push({
      fullUrl: `urn:Flag/${f.id}`,
      resource: {
        resourceType: 'Flag',
        id: f.id,
        status: f.reviewed_at ? 'inactive' : 'active',
        category: [{ text: 'safety' }],
        code: { text: f.trigger },
        subject: { reference: patientRef },
        encounter: { reference: encounterRef },
        period: { start: f.created_at },
      },
    })
  }

  return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), entry: entries }
}
