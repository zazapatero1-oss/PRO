// End-to-end check of migrations + seed + demo against a real Postgres engine
// (PGlite, Postgres compiled to WASM) without Docker or a hosted project.
//
//   deno test -A supabase/seed/schema.test.ts
//
// Supabase-specific pieces (auth schema, auth.uid(), roles) are shimmed the way
// Supabase implements them (auth.uid() reads the request.jwt.claim.sub setting).
import { PGlite } from "npm:@electric-sql/pglite@0.3.5";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "jsr:@std/path@1";

const ROOT = fromFileUrl(new URL("../..", import.meta.url));
const MIGRATIONS = `${ROOT}/supabase/migrations`;
const SEED = `${ROOT}/supabase/seed`;

type Row = Record<string, unknown>;

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const migrations = [...Deno.readDirSync(MIGRATIONS)]
    .map((e) => e.name)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const f of migrations) {
    await db.exec(await Deno.readTextFile(`${MIGRATIONS}/${f}`));
  }
  return db;
}

async function loadSeeds(db: PGlite): Promise<void> {
  await db.exec(await Deno.readTextFile(`${SEED}/seed.sql`));
  await db.exec(await Deno.readTextFile(`${SEED}/demo.sql`));
}

async function rows(db: PGlite, sql: string): Promise<Row[]> {
  return (await db.query(sql)).rows as Row[];
}

async function scalar(db: PGlite, sql: string): Promise<unknown> {
  return Object.values((await rows(db, sql))[0])[0];
}

async function count(db: PGlite, table: string): Promise<number> {
  return Number(await scalar(db, `select count(*) from public.${table}`));
}

async function fails(db: PGlite, sql: string): Promise<boolean> {
  try {
    await db.exec(sql);
    return false;
  } catch {
    return true;
  }
}

/** Run a statement as a Supabase role with an optional JWT subject. */
async function asRole(db: PGlite, role: string, sub: string | null, sql: string): Promise<Row[]> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try {
    return await rows(db, sql);
  } finally {
    await db.exec("reset role;");
  }
}

async function deniedAs(db: PGlite, role: string, sub: string | null, sql: string): Promise<boolean> {
  try {
    await asRole(db, role, sub, sql);
    return false;
  } catch {
    await db.exec("reset role;");
    return true;
  }
}

Deno.test("migrations apply and seeds load twice (idempotent)", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  await loadSeeds(db);
  assertEquals(await count(db, "instruments"), 4);
  assertEquals(await count(db, "diagnosis_catalog"), 17);
  assertEquals(await count(db, "construct_maps"), 2);
  assertEquals(await count(db, "participants"), 3);
  assertEquals(await count(db, "sessions"), 4);
  assertEquals(await count(db, "messages"), 63);
  assertEquals(await count(db, "construct_evidence"), 51);
  assertEquals(await count(db, "probe_findings"), 27);
  assertEquals(await count(db, "session_profiles"), 4);
  assertEquals(await count(db, "safety_flags"), 0);
  assertEquals(
    Number(await scalar(db, "select count(*) from public.construct_maps where status = 'approved' and approved_at is not null")),
    2,
  );
  await db.close();
});

Deno.test("study ids come from next_study_id()", async () => {
  const db = await freshDb();
  assertEquals(await scalar(db, "select public.next_study_id()"), "P-0001");
  await loadSeeds(db);
  const ids = (await rows(db, "select study_id from public.participants order by study_id")).map((r) => r.study_id);
  assertEquals(ids, ["P-0002", "P-0003", "P-0004"]);
  await db.close();
});

Deno.test("seed maps are well formed and diagnosis focus constructs resolve", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const maps = await rows(
    db,
    `select slug, jsonb_array_length(map->'domains') as domains,
            (select count(*) from jsonb_array_elements(map->'domains') d, jsonb_array_elements(d->'constructs')) as constructs
     from public.construct_maps order by slug`,
  );
  assertEquals(maps.map((m) => [m.slug, Number(m.domains), Number(m.constructs)]), [
    ["face-q-adult", 9, 33],
    ["face-q-pediatric", 8, 31],
  ]);
  const missing = await rows(
    db,
    `with ids as (
       select c->>'id' as cid from public.construct_maps cm,
         jsonb_array_elements(cm.map->'domains') d, jsonb_array_elements(d->'constructs') c)
     select dc.code, fc from public.diagnosis_catalog dc, unnest(dc.focus_constructs) fc
     where not exists (select 1 from ids where ids.cid = fc)`,
  );
  assertEquals(missing, []);
  const sizes = await rows(db, "select code, cardinality(focus_constructs) as n from public.diagnosis_catalog");
  for (const s of sizes) assert(Number(s.n) >= 8 && Number(s.n) <= 18, `${s.code} focus size ${s.n}`);
  await db.close();
});

Deno.test("every construct has 5-8 facets with unique ids (SPEC v1.1 §A)", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const bad = await rows(
    db,
    `with constructs as (
       select cm.slug, c->>'id' as cid, c->'facets' as facets
       from public.construct_maps cm,
         jsonb_array_elements(cm.map->'domains') d, jsonb_array_elements(d->'constructs') c)
     select slug, cid,
            coalesce(jsonb_array_length(facets), 0) as n,
            (select count(distinct f->>'id') from jsonb_array_elements(coalesce(facets, '[]'::jsonb)) f) as distinct_ids,
            (select count(*) from jsonb_array_elements(coalesce(facets, '[]'::jsonb)) f
             where f->>'id' !~ '^[a-z][a-z0-9_]*$' or coalesce(f->>'label', '') = '') as malformed
     from constructs
     where facets is null
        or jsonb_array_length(facets) not between 5 and 8
        or (select count(distinct f->>'id') from jsonb_array_elements(facets) f) <> jsonb_array_length(facets)
        or exists (select 1 from jsonb_array_elements(facets) f
                   where f->>'id' !~ '^[a-z][a-z0-9_]*$' or coalesce(f->>'label', '') = '')`,
  );
  assertEquals(bad, []);
  // Sanity: the facet total is what 33 + 31 constructs at 5-8 each should give.
  const total = Number(await scalar(
    db,
    `select count(*) from public.construct_maps cm,
       jsonb_array_elements(cm.map->'domains') d, jsonb_array_elements(d->'constructs') c,
       jsonb_array_elements(c->'facets') f`,
  ));
  assert(total >= 64 * 5 && total <= 64 * 8, `facet total ${total}`);
  await db.close();
});

Deno.test("both maps carry a triage block whose maps_to patterns resolve", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const maps = await rows(
    db,
    `select slug, jsonb_array_length(map->'triage') as items,
            (map->'coverage_rules'->>'focus_facet_threshold')::numeric as threshold
     from public.construct_maps order by slug`,
  );
  assertEquals(maps.length, 2);
  for (const m of maps) {
    assert(Number(m.items) >= 4, `${m.slug} has ${m.items} triage items`);
    assertEquals(Number(m.threshold), 0.7);
  }
  // Adult keeps the post-op-only recovery item.
  assertEquals(
    await scalar(
      db,
      `select t->'timepoints' from public.construct_maps cm, jsonb_array_elements(cm.map->'triage') t
       where cm.slug = 'face-q-adult' and t->>'id' = 'recovery'`,
    ),
    ["post-op-2w", "post-op-6w", "post-op-6m", "post-op-12m", "follow-up"],
  );
  // Every maps_to pattern (exact id or `domain.*` wildcard) hits >= 1 construct.
  const unresolved = await rows(
    db,
    `with ids as (
       select cm.slug, c->>'id' as cid from public.construct_maps cm,
         jsonb_array_elements(cm.map->'domains') d, jsonb_array_elements(d->'constructs') c),
     patterns as (
       select cm.slug, t->>'id' as item, p as pattern from public.construct_maps cm,
         jsonb_array_elements(cm.map->'triage') t, jsonb_array_elements_text(t->'maps_to') p)
     select p.slug, p.item, p.pattern from patterns p
     where not exists (
       select 1 from ids
       where ids.slug = p.slug
         and case when p.pattern like '%*'
                  then ids.cid like replace(p.pattern, '*', '%')
                  else ids.cid = p.pattern end)`,
  );
  assertEquals(unresolved, []);
  const triageIds = await rows(
    db,
    `select slug, count(*) as n, count(distinct t->>'id') as distinct_ids
     from public.construct_maps cm, jsonb_array_elements(cm.map->'triage') t
     group by slug`,
  );
  for (const r of triageIds) assertEquals(Number(r.n), Number(r.distinct_ids));
  await db.close();
});

Deno.test("v1.1 columns exist with the specified defaults and checks (SPEC v1.1 §D)", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const cols = await rows(
    db,
    `select table_name, column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in
         (('construct_evidence','facets'), ('construct_evidence','triage_item'),
          ('sessions','phase'), ('sessions','focus_constructs'),
          ('sessions','max_turns'), ('sessions','target_minutes'))
     order by table_name, column_name`,
  );
  const by = (t: string, c: string) => cols.find((r) => r.table_name === t && r.column_name === c)!;
  assertEquals(by("construct_evidence", "facets").data_type, "ARRAY");
  assertEquals(by("construct_evidence", "facets").is_nullable, "NO");
  assertEquals(by("construct_evidence", "triage_item").is_nullable, "YES");
  assertEquals(by("sessions", "phase").is_nullable, "NO");
  assert(String(by("sessions", "phase").column_default).includes("'triage'"));
  assertEquals(by("sessions", "focus_constructs").is_nullable, "NO");
  assertEquals(String(by("sessions", "max_turns").column_default), "60");
  assertEquals(String(by("sessions", "target_minutes").column_default), "20");

  const s1 = "d3a0c002-0000-4000-8000-000000000001";
  assert(await fails(db, `update public.sessions set phase = 'chatting' where id = '${s1}'`));
  for (const phase of ["triage", "explore", "wrap-up"]) {
    await db.exec(`update public.sessions set phase = '${phase}' where id = '${s1}'`);
  }
  await db.exec(`update public.sessions set phase = 'wrap-up' where id = '${s1}'`);

  // Defaults apply to a row that says nothing about the new columns.
  await db.exec(
    `insert into public.sessions (id, participant_id, timepoint, language, construct_map_id, prompt_version, model_id, resume_token_hash)
     values ('d3a0c002-0000-4000-8000-0000000000ff', 'd3a0c001-0000-4000-8000-000000000001', 'baseline', 'en',
             (select id from public.construct_maps where slug = 'face-q-adult' order by version desc limit 1),
             'v', 'm', repeat('a', 64))`,
  );
  const fresh = (await rows(
    db,
    "select phase, focus_constructs, max_turns, target_minutes from public.sessions where id = 'd3a0c002-0000-4000-8000-0000000000ff'",
  ))[0];
  assertEquals(fresh.phase, "triage");
  assertEquals(fresh.focus_constructs, []);
  assertEquals(Number(fresh.max_turns), 60);
  assertEquals(Number(fresh.target_minutes), 20);

  // Evidence rows can carry facet ids and a triage item; facets default to empty.
  await db.exec(
    `insert into public.construct_evidence (session_id, construct_id, patient_quote, quote_gloss_en, severity, confidence, facets, triage_item)
     values ('${s1}', 'appearance.eyes', 'q', 'q', 'mild', 0.8, array['shape','lids']::text[], 'features')`,
  );
  assertEquals(
    await scalar(db, `select facets from public.construct_evidence where triage_item = 'features'`),
    ["shape", "lids"],
  );
  assertEquals(
    Number(await scalar(db, `select count(*) from public.construct_evidence where facets = '{}' and triage_item is null`)),
    51,
  );
  await db.close();
});

Deno.test("demo sessions reference the seeded map version and carry phase + focus", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const sessions = await rows(
    db,
    `select s.phase, cm.slug, cm.version, cardinality(s.focus_constructs) as focus_n
     from public.sessions s join public.construct_maps cm on cm.id = s.construct_map_id
     order by s.created_at`,
  );
  assertEquals(sessions.length, 4);
  for (const s of sessions) {
    assertEquals(s.phase, "wrap-up");
    assertEquals(Number(s.version), 2);
    assert(Number(s.focus_n) >= 1 && Number(s.focus_n) <= 8, `focus size ${s.focus_n}`);
  }
  // Demo focus constructs must exist in the map that session points at.
  const unknown = await rows(
    db,
    `with ids as (
       select cm.id as map_id, c->>'id' as cid from public.construct_maps cm,
         jsonb_array_elements(cm.map->'domains') d, jsonb_array_elements(d->'constructs') c)
     select s.id, fc from public.sessions s, unnest(s.focus_constructs) fc
     where not exists (select 1 from ids where ids.map_id = s.construct_map_id and ids.cid = fc)`,
  );
  assertEquals(unknown, []);
  await db.close();
});

Deno.test("v_participant_timeline orders sessions by timepoint and summarises profiles", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const tl = await rows(
    db,
    `select study_id, timepoint, session_status, flag_count, assistant_turns, declined_count,
            jsonb_array_length(profile_summary) as domains
     from public.v_participant_timeline`,
  );
  assertEquals(tl.length, 4);
  assertEquals(tl[0].timepoint, "baseline");
  assertEquals(tl[1].timepoint, "post-op-6w");
  assertEquals(tl[0].study_id, tl[1].study_id);
  assertEquals(Number(tl[1].declined_count), 1);
  for (const r of tl) {
    assertEquals(r.session_status, "completed");
    assertEquals(Number(r.flag_count), 0);
    assert(Number(r.domains) >= 6);
  }
  await db.close();
});

Deno.test("check constraints reject invalid enum values", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const s1 = "d3a0c002-0000-4000-8000-000000000001";
  const cases: [string, string][] = [
    ["age_band", "insert into public.participants (display_name, age_band, diagnosis_code) values ('x','40-49','rhinoplasty')"],
    ["timepoint", `insert into public.sessions (participant_id, timepoint, language, construct_map_id, prompt_version, model_id, resume_token_hash)
       values ('d3a0c001-0000-4000-8000-000000000001','week-1','en','7a1c5e20-0002-4a00-8000-000000000011','v','m',repeat('a',64))`],
    ["severity", `insert into public.construct_evidence (session_id, construct_id, patient_quote, quote_gloss_en, severity, confidence) values ('${s1}','x','q','g','bad',0.5)`],
    ["confidence", `insert into public.construct_evidence (session_id, construct_id, patient_quote, quote_gloss_en, severity, confidence) values ('${s1}','x','q','g','mild',1.5)`],
    ["seq unique", `insert into public.messages (session_id, seq, role, content) values ('${s1}', 1, 'patient', 'dup')`],
    ["input_mode patient only", `insert into public.messages (session_id, seq, role, content, input_mode) values ('${s1}', 99, 'assistant', 'x', 'voice')`],
    ["probe category", `insert into public.probe_findings (session_id, construct_id, finding, category) values ('${s1}','x','f','guess')`],
    ["safety trigger", `insert into public.safety_flags (session_id, trigger, detected_by, action_taken) values ('${s1}','panic','keyword','halt')`],
    ["audit actor_type", `insert into public.audit_log (actor_type, action) values ('robot','x')`],
  ];
  for (const [name, sql] of cases) assert(await fails(db, sql), `${name} should be rejected`);
  await db.close();
});

Deno.test("RLS: anon nothing, non-clinician nothing, clinician read-all + own notes/audit", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const uid = "11111111-1111-4111-8111-111111111111";
  await db.exec(`insert into auth.users (id, email) values ('${uid}', 'clinician@example.invalid')`);

  assert(await deniedAs(db, "anon", null, "select count(*) from public.participants"));
  assert(await deniedAs(db, "anon", null, "select count(*) from public.v_participant_timeline"));
  assertEquals(Number((await asRole(db, "authenticated", uid, "select count(*) from public.participants"))[0].count), 0);
  assert(await deniedAs(db, "authenticated", uid, "select public.next_study_id()"));

  await db.exec(`insert into public.clinicians (id, display_name) values ('${uid}', 'Dr Demo')`);
  assertEquals(Number((await asRole(db, "authenticated", uid, "select count(*) from public.participants"))[0].count), 3);
  assertEquals(Number((await asRole(db, "authenticated", uid, "select count(*) from public.messages"))[0].count), 63);
  assertEquals(Number((await asRole(db, "authenticated", uid, "select count(*) from public.v_participant_timeline"))[0].count), 4);
  assert(await deniedAs(db, "authenticated", uid, "update public.participants set display_name = 'x'"));
  assert(await deniedAs(db, "authenticated", uid, "delete from public.messages"));

  const s1 = "d3a0c002-0000-4000-8000-000000000001";
  await asRole(db, "authenticated", uid, `insert into public.clinician_notes (session_id, clinician_id, note, focus_constructs) values ('${s1}', '${uid}', 'focus on breathing', array['function.breathing'])`);
  assert(await deniedAs(db, "authenticated", uid, `insert into public.clinician_notes (session_id, clinician_id, note) values ('${s1}', '22222222-2222-4222-8222-222222222222', 'spoof')`));
  await asRole(db, "authenticated", uid, `insert into public.audit_log (actor_type, actor_id, action, target_type, target_id) values ('clinician', '${uid}', 'session.view', 'session', '${s1}')`);
  assert(await deniedAs(db, "authenticated", uid, "insert into public.audit_log (actor_type, actor_id, action) values ('system', 'x', 'spoof')"));
  await db.close();
});

Deno.test("deleting a participant cascades to every dependent row (SPEC §13)", async () => {
  const db = await freshDb();
  await loadSeeds(db);
  const uid = "11111111-1111-4111-8111-111111111111";
  await db.exec(`insert into auth.users (id, email) values ('${uid}', 'clinician@example.invalid')`);
  await db.exec(`insert into public.clinicians (id, display_name) values ('${uid}', 'Dr Demo')`);
  await db.exec(`insert into public.clinician_notes (session_id, clinician_id, note) values ('d3a0c002-0000-4000-8000-000000000001', '${uid}', 'n')`);

  await db.exec("delete from public.participants where id = 'd3a0c001-0000-4000-8000-000000000001'");
  assertEquals(await count(db, "sessions"), 2);
  assertEquals(await count(db, "messages"), 63 - 31);
  assertEquals(await count(db, "construct_evidence"), 51 - 26);
  assertEquals(await count(db, "probe_findings"), 27 - 13);
  assertEquals(await count(db, "session_profiles"), 2);
  assertEquals(await count(db, "clinician_notes"), 0);

  await db.exec(`delete from auth.users where id = '${uid}'`);
  assertEquals(await count(db, "clinicians"), 0);
  await db.close();
});
