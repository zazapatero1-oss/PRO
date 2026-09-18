-- GENERATED FILE. Do not edit by hand; run supabase/seed/build_seed.py.
-- Reference data for FACE-Q Conversation: instruments, diagnosis catalog and
-- approved construct maps. Idempotent (upserts). No item text from any instrument.

begin;

-- instruments
insert into public.instruments (id, slug, name, version, publisher, license_notes, license_url, item_text_stored)
values (
  '6d2f3a10-0001-4a00-8000-000000000001',
  $seed$face-q-aesthetics$seed$,
  $seed$FACE-Q Aesthetics$seed$,
  $seed$2015 (as published; scale list current as of qportfolio.org)$seed$,
  $seed$Q-Portfolio (McMaster University / Memorial Sloan Kettering Cancer Center); distributed by Mapi Research Trust$seed$,
  $seed$FACE-Q Aesthetics is a licensed patient-reported outcome instrument distributed through Q-Portfolio and Mapi Research Trust (ePROVIDE). Use is free of charge for non-commercial academic and clinical use subject to registration and a user agreement; commercial use requires a paid licence. Questionnaire item text is copyrighted and is NOT stored in this repository or shown to patients. Only publicly documented scale names and paraphrased descriptions of what the scales measure are used to build construct maps.$seed$,
  $seed$https://qportfolio.org/face-q/face-q-aesthetics/$seed$,
  false
)
on conflict (slug) do update set
  name = excluded.name,
  version = excluded.version,
  publisher = excluded.publisher,
  license_notes = excluded.license_notes,
  license_url = excluded.license_url,
  item_text_stored = false;

insert into public.instruments (id, slug, name, version, publisher, license_notes, license_url, item_text_stored)
values (
  '6d2f3a10-0001-4a00-8000-000000000002',
  $seed$face-q-craniofacial$seed$,
  $seed$FACE-Q Craniofacial Module$seed$,
  $seed$2021 (as published; scale list current as of qportfolio.org)$seed$,
  $seed$Q-Portfolio (McMaster University / Memorial Sloan Kettering Cancer Center); distributed by Mapi Research Trust$seed$,
  $seed$FACE-Q Craniofacial Module (child and young adult, with parent-report options) is a licensed patient-reported outcome instrument distributed through Q-Portfolio and Mapi Research Trust (ePROVIDE). Use is free of charge for non-commercial academic and clinical use subject to registration and a user agreement; commercial use requires a paid licence. Questionnaire item text is copyrighted and is NOT stored in this repository or shown to patients. Only publicly documented scale names and paraphrased descriptions of what the scales measure are used to build construct maps.$seed$,
  $seed$https://qportfolio.org/face-q/face-q-craniofacial/$seed$,
  false
)
on conflict (slug) do update set
  name = excluded.name,
  version = excluded.version,
  publisher = excluded.publisher,
  license_notes = excluded.license_notes,
  license_url = excluded.license_url,
  item_text_stored = false;

insert into public.instruments (id, slug, name, version, publisher, license_notes, license_url, item_text_stored)
values (
  '6d2f3a10-0001-4a00-8000-000000000003',
  $seed$face-q-head-neck-cancer$seed$,
  $seed$FACE-Q Head and Neck Cancer Module$seed$,
  $seed$2019 (as published; scale list current as of qportfolio.org)$seed$,
  $seed$Q-Portfolio (McMaster University / Memorial Sloan Kettering Cancer Center); distributed by Mapi Research Trust$seed$,
  $seed$FACE-Q Head and Neck Cancer Module is a licensed patient-reported outcome instrument distributed through Q-Portfolio and Mapi Research Trust (ePROVIDE). Use is free of charge for non-commercial academic and clinical use subject to registration and a user agreement; commercial use requires a paid licence. Questionnaire item text is copyrighted and is NOT stored in this repository or shown to patients. Only publicly documented scale names and paraphrased descriptions of what the scales measure are used to build construct maps.$seed$,
  $seed$https://qportfolio.org/face-q/face-q-head-and-neck-cancer/$seed$,
  false
)
on conflict (slug) do update set
  name = excluded.name,
  version = excluded.version,
  publisher = excluded.publisher,
  license_notes = excluded.license_notes,
  license_url = excluded.license_url,
  item_text_stored = false;

insert into public.instruments (id, slug, name, version, publisher, license_notes, license_url, item_text_stored)
values (
  '6d2f3a10-0001-4a00-8000-000000000004',
  $seed$face-q-skin-cancer$seed$,
  $seed$FACE-Q Skin Cancer Module$seed$,
  $seed$2018 (as published; scale list current as of qportfolio.org)$seed$,
  $seed$Q-Portfolio (McMaster University / Memorial Sloan Kettering Cancer Center); distributed by Mapi Research Trust$seed$,
  $seed$FACE-Q Skin Cancer Module is a licensed patient-reported outcome instrument distributed through Q-Portfolio and Mapi Research Trust (ePROVIDE). Use is free of charge for non-commercial academic and clinical use subject to registration and a user agreement; commercial use requires a paid licence. Questionnaire item text is copyrighted and is NOT stored in this repository or shown to patients. Only publicly documented scale names and paraphrased descriptions of what the scales measure are used to build construct maps.$seed$,
  $seed$https://qportfolio.org/face-q/face-q-skin-cancer/$seed$,
  false
)
on conflict (slug) do update set
  name = excluded.name,
  version = excluded.version,
  publisher = excluded.publisher,
  license_notes = excluded.license_notes,
  license_url = excluded.license_url,
  item_text_stored = false;

-- diagnosis_catalog
insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$rhinoplasty$seed$,
  $seed$Rhinoplasty$seed$,
  $seed$Rinoplastia$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.nose$seed$, $seed$function.breathing$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.avoidance$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.pain_discomfort$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.decision$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$facelift$seed$,
  $seed$Facelift (rhytidectomy)$seed$,
  $seed$Lifting facial (ritidectomía)$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.chin_jawline$seed$, $seed$appearance.cheeks$seed$, $seed$appearance.skin$seed$, $seed$aging.appraisal$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.scarring$seed$, $seed$adverse.pain_discomfort$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.decision$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$injectables$seed$,
  $seed$Injectables (neuromodulators / fillers)$seed$,
  $seed$Inyectables (toxina botulínica / rellenos)$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.lips$seed$, $seed$appearance.cheeks$seed$, $seed$appearance.skin$seed$, $seed$appearance.eyes$seed$, $seed$aging.appraisal$seed$, $seed$psych.self_confidence$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.pain_discomfort$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$blepharoplasty$seed$,
  $seed$Eyelid surgery (blepharoplasty)$seed$,
  $seed$Cirugía de párpados (blefaroplastia)$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.eyes$seed$, $seed$aging.appraisal$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.scarring$seed$, $seed$adverse.pain_discomfort$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.decision$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$skin-resurfacing$seed$,
  $seed$Skin resurfacing (laser / peel)$seed$,
  $seed$Rejuvenecimiento cutáneo (láser / peeling)$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.skin$seed$, $seed$aging.appraisal$seed$, $seed$psych.self_confidence$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.pain_discomfort$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$cleft-lip-palate$seed$,
  $seed$Cleft lip and/or palate$seed$,
  $seed$Labio y/o paladar hendido (fisura labiopalatina)$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.lips$seed$, $seed$appearance.nose$seed$, $seed$appearance.smile_teeth$seed$, $seed$adverse.scarring$seed$, $seed$function.speaking$seed$, $seed$function.eating_drinking$seed$, $seed$function.breathing$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.school$seed$, $seed$social.teasing_comments$seed$, $seed$distress.preoccupation$seed$, $seed$adverse.pain_discomfort$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$craniosynostosis$seed$,
  $seed$Craniosynostosis$seed$,
  $seed$Craneosinostosis$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.eyes$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.school$seed$, $seed$social.teasing_comments$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$adverse.scarring$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.swelling_bruising$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$microtia$seed$,
  $seed$Microtia / ear reconstruction$seed$,
  $seed$Microtia / reconstrucción de oreja$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.ears$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.school$seed$, $seed$social.teasing_comments$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$adverse.scarring$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.asymmetry$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.decision$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$otoplasty$seed$,
  $seed$Prominent ears (otoplasty)$seed$,
  $seed$Orejas prominentes (otoplastia)$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.ears$seed$, $seed$psych.self_confidence$seed$, $seed$social.comfort$seed$, $seed$social.school$seed$, $seed$social.teasing_comments$seed$, $seed$distress.hiding$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.scarring$seed$, $seed$outcome.result$seed$, $seed$outcome.decision$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$hemifacial-microsomia$seed$,
  $seed$Hemifacial microsomia$seed$,
  $seed$Microsomía hemifacial$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.ears$seed$, $seed$appearance.cheeks$seed$, $seed$appearance.chin_jawline$seed$, $seed$adverse.asymmetry$seed$, $seed$function.eating_drinking$seed$, $seed$function.facial_expression$seed$, $seed$function.speaking$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.school$seed$, $seed$social.teasing_comments$seed$, $seed$distress.preoccupation$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$facial-palsy$seed$,
  $seed$Facial palsy$seed$,
  $seed$Parálisis facial$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.smile_teeth$seed$, $seed$function.facial_expression$seed$, $seed$function.eating_drinking$seed$, $seed$function.speaking$seed$, $seed$adverse.asymmetry$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.avoidance$seed$, $seed$social.teasing_comments$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$outcome.result$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$facial-trauma$seed$,
  $seed$Facial trauma / reconstruction$seed$,
  $seed$Traumatismo facial / reconstrucción$seed$,
  $seed$craniofacial$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$adverse.scarring$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.pain_discomfort$seed$, $seed$function.eating_drinking$seed$, $seed$function.facial_expression$seed$, $seed$function.breathing$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$hn-cancer$seed$,
  $seed$Head and neck cancer$seed$,
  $seed$Cáncer de cabeza y cuello$seed$,
  $seed$head-neck-cancer$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.smile_teeth$seed$, $seed$function.eating_drinking$seed$, $seed$function.speaking$seed$, $seed$function.swallowing_oral$seed$, $seed$function.facial_expression$seed$, $seed$adverse.scarring$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.numbness_sensation$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.avoidance$seed$, $seed$distress.preoccupation$seed$, $seed$distress.cancer_worry$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$oral-cancer$seed$,
  $seed$Oral cavity cancer$seed$,
  $seed$Cáncer de cavidad oral$seed$,
  $seed$head-neck-cancer$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.smile_teeth$seed$, $seed$function.eating_drinking$seed$, $seed$function.speaking$seed$, $seed$function.swallowing_oral$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.scarring$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.avoidance$seed$, $seed$distress.cancer_worry$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$skin-cancer-face$seed$,
  $seed$Facial skin cancer$seed$,
  $seed$Cáncer de piel facial$seed$,
  $seed$skin-cancer$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.skin$seed$, $seed$adverse.scarring$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.pain_discomfort$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$distress.cancer_worry$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$mohs-reconstruction$seed$,
  $seed$Reconstruction after Mohs surgery$seed$,
  $seed$Reconstrucción tras cirugía de Mohs$seed$,
  $seed$skin-cancer$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$appearance.nose$seed$, $seed$appearance.eyes$seed$, $seed$appearance.lips$seed$, $seed$adverse.scarring$seed$, $seed$adverse.asymmetry$seed$, $seed$adverse.numbness_sensation$seed$, $seed$adverse.swelling_bruising$seed$, $seed$adverse.pain_discomfort$seed$, $seed$function.facial_expression$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$distress.cancer_worry$seed$, $seed$recovery.daily_activities$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

insert into public.diagnosis_catalog (code, label_en, label_es, module, default_map_slug_adult, default_map_slug_pediatric, focus_constructs)
values (
  $seed$other$seed$,
  $seed$Other (see free text)$seed$,
  $seed$Otro (ver texto libre)$seed$,
  $seed$aesthetics$seed$,
  $seed$face-q-adult$seed$,
  $seed$face-q-pediatric$seed$,
  array[$seed$appearance.overall$seed$, $seed$psych.self_confidence$seed$, $seed$psych.mood$seed$, $seed$social.comfort$seed$, $seed$social.avoidance$seed$, $seed$distress.preoccupation$seed$, $seed$distress.hiding$seed$, $seed$adverse.pain_discomfort$seed$, $seed$adverse.scarring$seed$, $seed$function.facial_expression$seed$, $seed$outcome.result$seed$, $seed$outcome.information$seed$]::text[]
)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_es = excluded.label_es,
  module = excluded.module,
  default_map_slug_adult = excluded.default_map_slug_adult,
  default_map_slug_pediatric = excluded.default_map_slug_pediatric,
  focus_constructs = excluded.focus_constructs;

-- construct_maps (status approved; approved_by null = seeded, not clinician-approved)
insert into public.construct_maps (id, slug, version, population, source_instrument_ids, map, status, approved_by, approved_at)
values (
  '7a1c5e20-0002-4a00-8000-000000000011',
  $seed$face-q-adult$seed$,
  2,
  $seed$adult$seed$,
  array['6d2f3a10-0001-4a00-8000-000000000001', '6d2f3a10-0001-4a00-8000-000000000002', '6d2f3a10-0001-4a00-8000-000000000003', '6d2f3a10-0001-4a00-8000-000000000004']::uuid[],
  $seed${
  "slug": "face-q-adult",
  "version": 2,
  "population": "adult",
  "language": "en",
  "notes": "Built from publicly documented FACE-Q scale names and what those scales measure. Descriptions are paraphrased constructs; no questionnaire item text is included. For satisfaction-type constructs, 'severity' expresses the degree of dissatisfaction or concern. Constructs with 'applicable_timepoints' are only active at those timepoints (extension to SPEC §6, see seed/README.md). Version 2 adds SPEC v1.1 facets (5-8 paraphrased, clinician-relevant details per construct, explored when the construct is a focus) and the top-level triage block asked at the start of every session.",
  "domains": [
    {
      "id": "appearance",
      "label": "Satisfaction with facial appearance",
      "weight": 1.0,
      "constructs": [
        {
          "id": "appearance.overall",
          "label": "Overall satisfaction with how the face looks",
          "description": "How the person feels about their facial appearance as a whole: in the mirror, in photos and video, first thing in the morning, and whether it fits how they feel inside.",
          "severity_signals": {
            "none": "content or positive about their face as a whole",
            "mild": "occasional dissatisfaction or a single feature they would tweak; no avoidance",
            "moderate": "regular dissatisfaction; some avoidance of mirrors, photos or video calls",
            "severe": "persistent distress about their face; avoidance or checking that shapes daily life"
          },
          "drill_down": [
            "Which features bother them most",
            "Situations where it feels worse (photos, video calls, bright light, mornings)",
            "How long they have felt this way and whether it is changing",
            "What they hope will be different"
          ],
          "facets": [
            {
              "id": "whole_face",
              "label": "How the face works together as a whole, not one feature"
            },
            {
              "id": "features_named",
              "label": "Which features bother them most, in their own words"
            },
            {
              "id": "mirror_vs_photos",
              "label": "How it looks in the mirror versus photos and video"
            },
            {
              "id": "situations",
              "label": "Situations, lighting or times of day when it feels worse"
            },
            {
              "id": "fits_self",
              "label": "Whether their face fits how they feel inside or their age"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            },
            {
              "id": "since_when",
              "label": "How long they have felt this way and whether it is changing"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "How the child feels about their face at school, with friends, and in photos.",
              "drill_down": [
                "Teasing or comments from others",
                "Whether they avoid activities or photos"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Facial Appearance Overall"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Face"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Satisfaction with Facial Appearance"
            }
          ]
        },
        {
          "id": "appearance.nose",
          "label": "Satisfaction with the nose",
          "description": "How the person feels about the size, shape, profile, tip and nostrils of their nose, from the front and from the side, and whether it looks in proportion with the rest of the face.",
          "severity_signals": {
            "none": "happy with or neutral about their nose",
            "mild": "minor niggles about one aspect (bump, tip, width)",
            "moderate": "clearly bothered; notices it in most photos or from certain angles",
            "severe": "nose is a constant preoccupation; drives avoidance of photos or profile views"
          },
          "drill_down": [
            "Which aspect: bridge, tip, width, nostrils, profile",
            "Angles or lighting where it bothers them most",
            "Whether breathing is also a concern",
            "How long it has bothered them"
          ],
          "facets": [
            {
              "id": "bridge",
              "label": "The bridge: bumps, straightness, height"
            },
            {
              "id": "tip",
              "label": "The tip: shape, droop, definition"
            },
            {
              "id": "width",
              "label": "Width of the nose and how it sits in the face"
            },
            {
              "id": "nostrils",
              "label": "Nostrils: size, shape, whether they match"
            },
            {
              "id": "profile_vs_front",
              "label": "How it looks from the side versus straight on"
            },
            {
              "id": "breathing_link",
              "label": "Whether breathing through the nose is also a concern"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            },
            {
              "id": "since_when",
              "label": "How long it has bothered them, and any injury or surgery behind it"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Nose"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Nostrils"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Nose"
            }
          ]
        },
        {
          "id": "appearance.eyes",
          "label": "Satisfaction with the eyes and under-eye area",
          "description": "How the person feels about the look of their eyes: eyelids, symmetry, how awake or rested they look, and the under-eye area (bags, hollows, dark circles).",
          "severity_signals": {
            "none": "content with how their eyes look",
            "mild": "occasionally notices tiredness or puffiness",
            "moderate": "regularly feels the eyes look tired, uneven or older than they feel",
            "severe": "eyes are a persistent source of distress; uses concealment or avoids close-up views"
          },
          "drill_down": [
            "Upper lids, lower lids or under-eye area",
            "Whether people comment that they look tired",
            "Vision or eye comfort concerns",
            "Time of day or situations where it is worse"
          ],
          "facets": [
            {
              "id": "shape",
              "label": "Shape of the eyes"
            },
            {
              "id": "symmetry",
              "label": "Whether the two eyes match"
            },
            {
              "id": "position",
              "label": "Where they sit on the face and how far apart"
            },
            {
              "id": "lids",
              "label": "Eyelids and the under-eye area: hoods, bags, hollows, dark circles"
            },
            {
              "id": "photos_vs_mirror",
              "label": "How they look in photos versus the mirror"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            },
            {
              "id": "since_when",
              "label": "How long this has bothered them"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Eyes"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Under Eye Area"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Eyes"
            }
          ]
        },
        {
          "id": "appearance.lips",
          "label": "Satisfaction with the lips",
          "description": "How the person feels about the shape, fullness, symmetry and definition of their lips and the lines around the mouth.",
          "severity_signals": {
            "none": "content with their lips",
            "mild": "minor wish for a change in fullness or symmetry",
            "moderate": "regularly bothered by lip shape, thinness or lines around the mouth",
            "severe": "lips are a constant preoccupation; conceals or avoids smiling in photos"
          },
          "drill_down": [
            "Fullness, shape, symmetry or lines around the mouth",
            "Whether smiling or speaking makes it more noticeable",
            "Previous treatments and how they felt about them"
          ],
          "facets": [
            {
              "id": "fullness",
              "label": "Fullness of the upper and lower lip"
            },
            {
              "id": "shape",
              "label": "Shape and definition of the lip border"
            },
            {
              "id": "symmetry",
              "label": "Whether the two sides match"
            },
            {
              "id": "lines_around_mouth",
              "label": "Lines and creases around the mouth"
            },
            {
              "id": "movement",
              "label": "Whether smiling or speaking makes it more noticeable"
            },
            {
              "id": "prior_treatment",
              "label": "Any previous lip treatment and how they felt about it"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Lips"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Lip Lines"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Lips"
            }
          ]
        },
        {
          "id": "appearance.cheeks",
          "label": "Satisfaction with the cheeks and mid-face",
          "description": "How the person feels about the fullness, contour and symmetry of their cheeks and the area between the eyes and the mouth.",
          "severity_signals": {
            "none": "content with their cheeks",
            "mild": "occasionally notices flatness, fullness or unevenness",
            "moderate": "regularly bothered by cheek volume, sagging or asymmetry",
            "severe": "cheek appearance dominates how they see their face; avoids certain angles"
          },
          "drill_down": [
            "Volume loss, heaviness or asymmetry",
            "Whether it is worse on one side",
            "How it changed over time"
          ],
          "facets": [
            {
              "id": "volume",
              "label": "Fullness or hollowness of the cheeks"
            },
            {
              "id": "contour",
              "label": "Cheekbone shape and mid-face contour"
            },
            {
              "id": "symmetry",
              "label": "Whether one side looks different from the other"
            },
            {
              "id": "heaviness",
              "label": "Heaviness or sagging towards the mouth"
            },
            {
              "id": "change_over_time",
              "label": "How it has changed with age, weight or treatment"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Cheeks"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Cheeks"
            }
          ]
        },
        {
          "id": "appearance.chin_jawline",
          "label": "Satisfaction with the chin, jawline and neck",
          "description": "How the person feels about the definition of their jawline, the size and projection of their chin, and looseness or fullness under the chin and in the neck.",
          "severity_signals": {
            "none": "content with the lower face and neck",
            "mild": "occasional wish for a sharper jawline or a different chin",
            "moderate": "regularly bothered by jowls, chin shape or neck laxity; adjusts posture or clothing",
            "severe": "lower face and neck are a persistent distress; avoids side views or photos"
          },
          "drill_down": [
            "Jawline definition, chin size or neck laxity",
            "Whether it is more noticeable from the side or in photos",
            "How it affects clothing choices or posture"
          ],
          "facets": [
            {
              "id": "projection",
              "label": "Chin size and how far it comes forward"
            },
            {
              "id": "definition",
              "label": "How sharp or blurred the jawline is"
            },
            {
              "id": "symmetry",
              "label": "Whether the jaw sits evenly"
            },
            {
              "id": "neck",
              "label": "Looseness or fullness under the chin and in the neck"
            },
            {
              "id": "profile_views",
              "label": "How it looks from the side and in photos"
            },
            {
              "id": "daily_impact",
              "label": "Whether it changes posture, collars or how they angle for photos"
            },
            {
              "id": "wanted_change",
              "label": "What specifically they would want different"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Chin"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Lower Face and Jawline"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Neck"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Chin"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Jaw"
            }
          ]
        },
        {
          "id": "appearance.skin",
          "label": "Satisfaction with facial skin",
          "description": "How the person feels about the texture, tone, evenness, pores, lines and overall quality of the skin on their face.",
          "severity_signals": {
            "none": "content with their skin",
            "mild": "occasional bother about texture, tone or lines",
            "moderate": "regularly bothered by skin quality; relies on makeup or filters",
            "severe": "skin appearance causes persistent distress; avoids being seen without concealment"
          },
          "drill_down": [
            "Texture, tone, pigmentation, pores or lines",
            "Sun-related or treatment-related changes",
            "How much effort goes into concealing it"
          ],
          "facets": [
            {
              "id": "texture",
              "label": "Texture: roughness, pores, bumps"
            },
            {
              "id": "tone_colour",
              "label": "Tone and colour: redness, patchiness, pigmentation"
            },
            {
              "id": "lines",
              "label": "Lines and creases"
            },
            {
              "id": "marks_scars",
              "label": "Marks, blemishes or scars on the skin"
            },
            {
              "id": "areas",
              "label": "Which specific areas of the face"
            },
            {
              "id": "covering",
              "label": "Makeup or other covering, and how much effort it takes"
            },
            {
              "id": "history",
              "label": "Sun exposure, skin conditions or treatments behind it"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Facial Skin"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Skin"
            }
          ]
        },
        {
          "id": "appearance.smile_teeth",
          "label": "Satisfaction with the smile and teeth",
          "description": "How the person feels about their smile: how it looks, how natural and symmetric it is, and how their teeth and mouth look when they smile.",
          "severity_signals": {
            "none": "comfortable smiling openly",
            "mild": "occasionally self-conscious about their smile",
            "moderate": "regularly holds back or covers their smile",
            "severe": "avoids smiling or laughing in front of others"
          },
          "drill_down": [
            "Symmetry, teeth, gums or lip movement",
            "Whether they cover their mouth when laughing",
            "Situations where it matters most (photos, meeting people)"
          ],
          "facets": [
            {
              "id": "teeth_show",
              "label": "How much of the teeth shows when smiling"
            },
            {
              "id": "lip_movement",
              "label": "How the lips move when smiling or laughing"
            },
            {
              "id": "gums",
              "label": "How much gum shows and how the gums look"
            },
            {
              "id": "symmetry",
              "label": "Whether the smile is even on both sides"
            },
            {
              "id": "covering_mouth",
              "label": "Whether they cover their mouth when laughing or in photos"
            },
            {
              "id": "situations",
              "label": "Situations where it matters most"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Smile"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Teeth"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Smiling"
            }
          ]
        }
      ]
    },
    {
      "id": "psychological",
      "label": "Psychological function",
      "weight": 1.0,
      "constructs": [
        {
          "id": "psych.self_confidence",
          "label": "Self-confidence and feeling at ease with oneself",
          "description": "How confident, attractive and at ease the person feels in themselves day to day, and how much their facial appearance or condition supports or undermines that.",
          "severity_signals": {
            "none": "feels confident and comfortable in themselves",
            "mild": "confidence dips occasionally, tied to specific situations",
            "moderate": "confidence is regularly undermined by how they feel about their face",
            "severe": "pervasive low confidence; feels unattractive or diminished most of the time"
          },
          "drill_down": [
            "Situations where confidence drops most",
            "Whether this has changed over the past months",
            "What helps them feel more confident",
            "Whether it affects work or study"
          ],
          "facets": [
            {
              "id": "situations",
              "label": "Situations where confidence drops most"
            },
            {
              "id": "frequency",
              "label": "How often this comes up in a typical week"
            },
            {
              "id": "at_ease",
              "label": "How attractive or at ease they feel in themselves"
            },
            {
              "id": "work_study",
              "label": "Whether it affects work, study or opportunities they take"
            },
            {
              "id": "what_helps",
              "label": "What helps them feel more confident"
            },
            {
              "id": "trend",
              "label": "Whether it has changed over recent months"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "How sure of themselves the child feels around other children and adults, and whether their face makes them feel different.",
              "drill_down": [
                "Whether they feel 'like the other kids'",
                "Activities they enjoy where they feel good about themselves"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Psychological Function"
            }
          ]
        },
        {
          "id": "psych.self_acceptance",
          "label": "Acceptance of one's appearance",
          "description": "Whether the person accepts and feels comfortable with how they look, or feels a persistent gap between how they look and how they want to look.",
          "severity_signals": {
            "none": "accepts their appearance, including imperfections",
            "mild": "mostly accepting with occasional wishes for change",
            "moderate": "regularly struggles to accept how they look",
            "severe": "cannot accept their appearance; strong sense of being defined by it"
          },
          "drill_down": [
            "Whether acceptance varies by day or situation",
            "What would need to change for them to feel at peace",
            "Whether others' reassurance helps"
          ],
          "facets": [
            {
              "id": "gap",
              "label": "The gap between how they look and how they want to look"
            },
            {
              "id": "variability",
              "label": "Whether acceptance varies by day or situation"
            },
            {
              "id": "reassurance",
              "label": "Whether reassurance from others helps or not"
            },
            {
              "id": "comparisons",
              "label": "Comparing themselves with others or with old photos"
            },
            {
              "id": "what_would_change",
              "label": "What would need to change for them to feel at peace"
            },
            {
              "id": "trend",
              "label": "Whether this has shifted over time"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            }
          ]
        },
        {
          "id": "psych.mood",
          "label": "Mood and emotional wellbeing linked to appearance",
          "description": "Feeling low, frustrated, anxious or upset because of facial appearance, the condition, or its treatment; how much of the person's emotional life this takes up.",
          "severity_signals": {
            "none": "mood is not affected by their face or condition",
            "mild": "occasional bad days linked to their appearance",
            "moderate": "regular low mood or worry tied to appearance; recovers with distraction",
            "severe": "persistent low mood or anxiety about appearance affecting sleep, energy or motivation"
          },
          "drill_down": [
            "How often it affects mood in a typical week",
            "Whether sleep, appetite or energy are affected",
            "Whether they have talked to anyone about it",
            "Whether treatment has changed this"
          ],
          "facets": [
            {
              "id": "frequency",
              "label": "How often mood is affected in a typical week"
            },
            {
              "id": "quality",
              "label": "Whether it shows as low mood, worry, frustration or anger"
            },
            {
              "id": "triggers",
              "label": "Situations that set it off"
            },
            {
              "id": "sleep_appetite",
              "label": "Whether sleep, appetite or energy are affected"
            },
            {
              "id": "coping",
              "label": "What they do when they feel that way"
            },
            {
              "id": "support",
              "label": "Whether they have talked to anyone about it"
            },
            {
              "id": "trend",
              "label": "Whether time or treatment has changed this"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "Whether the child seems sad, worried or angry about their face, and how the guardian sees this affecting them at home.",
              "drill_down": [
                "Signs the guardian notices (withdrawal, tears, anger)",
                "Whether it is worse around school events or photos"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Appearance-related Psychosocial Distress"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            }
          ]
        }
      ]
    },
    {
      "id": "social",
      "label": "Social function",
      "weight": 1.0,
      "constructs": [
        {
          "id": "social.comfort",
          "label": "Comfort in social situations",
          "description": "How at ease the person feels meeting people, being in groups, being looked at or photographed, and taking part in social life.",
          "severity_signals": {
            "none": "comfortable socially; face does not come into it",
            "mild": "slightly self-aware in some settings (new people, cameras)",
            "moderate": "regularly uncomfortable; prefers familiar company or low-visibility settings",
            "severe": "social situations feel threatening; strong urge to hide or leave"
          },
          "drill_down": [
            "Which settings are hardest (work, family, strangers, cameras)",
            "Whether this is new or long-standing",
            "What they do to cope in those moments"
          ],
          "facets": [
            {
              "id": "settings",
              "label": "Which settings are hardest: work, family, strangers, groups"
            },
            {
              "id": "being_looked_at",
              "label": "Being looked at, photographed or on video"
            },
            {
              "id": "new_people",
              "label": "Meeting people for the first time"
            },
            {
              "id": "frequency",
              "label": "How often these situations come up"
            },
            {
              "id": "coping",
              "label": "What they do to cope in the moment"
            },
            {
              "id": "trend",
              "label": "Whether this is new or long-standing"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "How comfortable the child is with friends, in play and at parties or group activities.",
              "drill_down": [
                "Whether they join in or hang back",
                "Whether they have close friends they feel relaxed with"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Social Function"
            }
          ]
        },
        {
          "id": "social.avoidance",
          "label": "Avoidance of social or public situations",
          "description": "Whether the person turns down invitations, avoids going out, avoids photos or video, or withdraws from activities because of how their face looks or works.",
          "severity_signals": {
            "none": "no avoidance",
            "mild": "occasionally opts out of photos or events",
            "moderate": "regularly avoids some activities or people because of their face",
            "severe": "withdrawn from most social life; isolation because of appearance"
          },
          "drill_down": [
            "Specific activities or events they have skipped",
            "How often in the last month",
            "Whether it affects work, study or family life",
            "Whether treatment has changed this"
          ],
          "facets": [
            {
              "id": "activities",
              "label": "Specific activities or events they have skipped"
            },
            {
              "id": "frequency",
              "label": "How often in the last month"
            },
            {
              "id": "photos_video",
              "label": "Avoiding photos, video calls or being in the frame"
            },
            {
              "id": "life_impact",
              "label": "Whether it affects work, study or family life"
            },
            {
              "id": "workarounds",
              "label": "What they do instead, or the conditions they need to go"
            },
            {
              "id": "trend",
              "label": "Whether this has changed with time or treatment"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            }
          ]
        },
        {
          "id": "social.teasing_comments",
          "label": "Comments, stares and teasing from others",
          "description": "Whether the person experiences stares, questions, unwanted comments, teasing or exclusion because of their facial appearance, and how they respond.",
          "severity_signals": {
            "none": "no comments or stares that bother them",
            "mild": "occasional questions or looks that they brush off",
            "moderate": "regular comments or stares that upset them or that they plan around",
            "severe": "frequent teasing, bullying or exclusion; significant hurt or fear"
          },
          "drill_down": [
            "Who it comes from (strangers, colleagues, family, online)",
            "How they respond in the moment",
            "Whether it has changed over time"
          ],
          "facets": [
            {
              "id": "source",
              "label": "Who it comes from: strangers, colleagues, family, online"
            },
            {
              "id": "nature",
              "label": "Stares, questions, comments, teasing or being left out"
            },
            {
              "id": "frequency",
              "label": "How often it happens"
            },
            {
              "id": "response",
              "label": "How they respond in the moment"
            },
            {
              "id": "aftereffect",
              "label": "How they feel afterwards and what they do"
            },
            {
              "id": "trend",
              "label": "Whether it has changed over time"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "Whether the child is teased, stared at, asked questions or left out at school or in play because of their face.",
              "drill_down": [
                "Whether teachers or the school know",
                "Whether the child tells the guardian when it happens",
                "Whether they have a comeback or plan"
              ]
            }
          },
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        },
        {
          "id": "social.relationships",
          "label": "Close relationships and intimacy",
          "description": "How facial appearance or condition affects closeness with a partner, family or close friends, including dating and physical affection.",
          "severity_signals": {
            "none": "relationships unaffected",
            "mild": "occasional self-consciousness with close others",
            "moderate": "holds back from closeness or dating because of their face",
            "severe": "relationships strained or avoided; feels unlovable because of appearance"
          },
          "drill_down": [
            "Whether a partner or family have noticed a change",
            "Whether they avoid dating or affection",
            "What support they have"
          ],
          "facets": [
            {
              "id": "partner",
              "label": "How it affects a current relationship"
            },
            {
              "id": "dating",
              "label": "Whether they avoid dating or meeting new people"
            },
            {
              "id": "affection",
              "label": "Physical closeness and being seen up close"
            },
            {
              "id": "family_friends",
              "label": "Closeness with family and close friends"
            },
            {
              "id": "disclosure",
              "label": "Whether they talk about it with the people close to them"
            },
            {
              "id": "support",
              "label": "What support they have"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Social Function"
            }
          ]
        }
      ]
    },
    {
      "id": "distress",
      "label": "Appearance-related distress",
      "weight": 1.0,
      "constructs": [
        {
          "id": "distress.preoccupation",
          "label": "Preoccupation with appearance",
          "description": "How much mental space facial appearance takes: thinking about it, checking it, comparing to others, and feeling unable to stop.",
          "severity_signals": {
            "none": "rarely thinks about it",
            "mild": "thinks about it now and then; can set it aside",
            "moderate": "thinks about it most days; some checking or comparing",
            "severe": "intrusive, hard-to-control preoccupation; frequent checking or reassurance seeking"
          },
          "drill_down": [
            "How much of the day it occupies",
            "Checking, comparing or reassurance-seeking behaviours",
            "When it started or intensified",
            "Whether it affects concentration or sleep"
          ],
          "facets": [
            {
              "id": "time_occupied",
              "label": "How much of the day it takes up"
            },
            {
              "id": "checking",
              "label": "Mirror, camera or photo checking"
            },
            {
              "id": "comparing",
              "label": "Comparing with other people or with old photos"
            },
            {
              "id": "reassurance",
              "label": "Asking others for reassurance"
            },
            {
              "id": "interference",
              "label": "Whether it affects concentration, work or sleep"
            },
            {
              "id": "control",
              "label": "Whether they can put it aside when they want to"
            },
            {
              "id": "onset",
              "label": "When it started or intensified"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "How often the child talks about, checks or worries about their face, as seen by the child or the guardian.",
              "drill_down": [
                "Whether they ask 'why do I look different'",
                "Mirror or photo checking"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Appearance-related Psychosocial Distress"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Appearance Distress"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Appearance-related Psychosocial Distress"
            }
          ]
        },
        {
          "id": "distress.hiding",
          "label": "Hiding or camouflaging the face",
          "description": "Effort spent concealing the face or a feature: makeup, hair, glasses, hats, masks, angles in photos, filters, or avoiding being seen in certain light.",
          "severity_signals": {
            "none": "no concealment beyond ordinary grooming",
            "mild": "some concealment for special occasions or photos",
            "moderate": "daily concealment; uncomfortable being seen without it",
            "severe": "cannot leave the house or be seen without concealment; strong distress if exposed"
          },
          "drill_down": [
            "What they use to conceal and how long it takes",
            "Whether anyone has seen them without it",
            "How they would feel if they could not conceal"
          ],
          "facets": [
            {
              "id": "methods",
              "label": "What they use: makeup, hair, glasses, hats, masks"
            },
            {
              "id": "time_cost",
              "label": "How long it takes and what it costs them"
            },
            {
              "id": "situations",
              "label": "Situations where they will not go without it"
            },
            {
              "id": "photos_angles",
              "label": "Angles, filters or lighting they rely on in photos"
            },
            {
              "id": "seen_without",
              "label": "Whether anyone has seen them without it"
            },
            {
              "id": "if_unable",
              "label": "How they would feel if they could not conceal it"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Appearance-related Psychosocial Distress"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Appearance-related Psychosocial Distress"
            }
          ]
        },
        {
          "id": "distress.cancer_worry",
          "label": "Worry about cancer",
          "description": "For cancer-related conditions: worry about the cancer coming back or spreading, about further treatment, and about what changes on the face might mean.",
          "severity_signals": {
            "none": "not worried, or worry is contained",
            "mild": "occasional worry around check-ups",
            "moderate": "worries most weeks; checks the face for changes",
            "severe": "constant worry that interferes with sleep, plans or daily life"
          },
          "drill_down": [
            "What specifically they worry about",
            "Whether check-ups or news stories trigger it",
            "Whether they self-examine and how often",
            "Whether they have asked their team about it"
          ],
          "facets": [
            {
              "id": "content",
              "label": "What specifically they worry about"
            },
            {
              "id": "frequency",
              "label": "How often the worry comes and how long it stays"
            },
            {
              "id": "triggers",
              "label": "What sets it off: check-ups, scans, news, a new mark"
            },
            {
              "id": "self_checking",
              "label": "Whether they examine their skin or face, and how often"
            },
            {
              "id": "interference",
              "label": "Whether it affects sleep, mood or plans"
            },
            {
              "id": "team",
              "label": "Whether they have raised it with their team"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Cancer Worry"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Cancer Worry"
            }
          ]
        }
      ]
    },
    {
      "id": "function",
      "label": "Facial function",
      "weight": 0.8,
      "constructs": [
        {
          "id": "function.breathing",
          "label": "Breathing through the nose",
          "description": "Ease of breathing through the nose at rest, during exercise, when lying down and when sleeping; blocked or congested feeling; snoring or mouth breathing.",
          "severity_signals": {
            "none": "breathes easily through the nose",
            "mild": "occasional blockage (colds, one side, at night)",
            "moderate": "regular difficulty; mouth breathes or wakes at night",
            "severe": "constant obstruction affecting sleep, exercise or daily comfort"
          },
          "drill_down": [
            "One side or both; day or night",
            "Effect on sleep or exercise",
            "Whether it changed after injury, surgery or treatment",
            "Sprays or aids they rely on"
          ],
          "facets": [
            {
              "id": "sides",
              "label": "One side or both"
            },
            {
              "id": "day_night",
              "label": "Daytime versus lying down and at night"
            },
            {
              "id": "exertion",
              "label": "Breathing during exercise or exertion"
            },
            {
              "id": "sleep",
              "label": "Snoring, mouth breathing, disturbed sleep, daytime tiredness"
            },
            {
              "id": "aids",
              "label": "Sprays, strips or other things they rely on"
            },
            {
              "id": "onset",
              "label": "Whether it followed injury, surgery or treatment"
            },
            {
              "id": "workarounds",
              "label": "What they avoid or change because of it"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Breathing"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Nose"
            }
          ]
        },
        {
          "id": "function.eating_drinking",
          "label": "Eating and drinking",
          "description": "Ability to chew, bite, keep food and liquid in the mouth, eat a normal range of foods, and eat in front of others without difficulty.",
          "severity_signals": {
            "none": "eats and drinks normally",
            "mild": "avoids a few foods or eats a little more slowly",
            "moderate": "regular difficulty chewing, leaking or spilling; avoids eating in company",
            "severe": "eating is a daily struggle; weight, nutrition or social eating significantly affected"
          },
          "drill_down": [
            "Which foods or textures are hard",
            "Leaking, spilling or drooling",
            "Whether they avoid eating with others",
            "Weight change"
          ],
          "facets": [
            {
              "id": "foods",
              "label": "Which foods or textures are hard"
            },
            {
              "id": "chewing",
              "label": "Biting and chewing"
            },
            {
              "id": "containment",
              "label": "Keeping food and drink in the mouth; leaking or spilling"
            },
            {
              "id": "effort_time",
              "label": "How long meals take and how tiring they are"
            },
            {
              "id": "social_eating",
              "label": "Eating in front of other people"
            },
            {
              "id": "weight",
              "label": "Weight change or skipping meals"
            },
            {
              "id": "workarounds",
              "label": "How they adapt: cutting up, soft foods, drinks, aids"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Eating and Drinking"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Eating Distress"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Oral Competence"
            }
          ]
        },
        {
          "id": "function.speaking",
          "label": "Speaking and being understood",
          "description": "Clarity of speech, being understood by strangers and on the phone, effort or tiredness when talking, and reluctance to speak because of how it sounds.",
          "severity_signals": {
            "none": "speech is clear and effortless",
            "mild": "occasionally asked to repeat; some words are harder",
            "moderate": "regularly misunderstood; avoids the phone or speaking up",
            "severe": "speech severely limits communication; relies on others or writing"
          },
          "drill_down": [
            "Which sounds or situations are hardest",
            "Phone calls and strangers versus family",
            "Whether they hold back from speaking",
            "Speech therapy or aids"
          ],
          "facets": [
            {
              "id": "clarity",
              "label": "How clear their speech is"
            },
            {
              "id": "hard_sounds",
              "label": "Which sounds or words are hardest"
            },
            {
              "id": "listeners",
              "label": "Strangers and the phone versus family who know them"
            },
            {
              "id": "effort",
              "label": "Effort or tiredness when talking for a while"
            },
            {
              "id": "holding_back",
              "label": "Whether they say less because of it"
            },
            {
              "id": "situations",
              "label": "Situations where it matters most: work, groups, noise"
            },
            {
              "id": "therapy",
              "label": "Speech therapy or aids and whether they help"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Speaking"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Speaking"
            }
          ]
        },
        {
          "id": "function.facial_expression",
          "label": "Facial expression and movement",
          "description": "Ability to smile, frown, raise the eyebrows, close the eyes and show emotion with the face; whether expressions look symmetric and natural.",
          "severity_signals": {
            "none": "full, natural expression",
            "mild": "slight asymmetry or stiffness they notice",
            "moderate": "expressions look uneven or limited; people misread their mood",
            "severe": "cannot express emotion with the face; eye closure or lip function problems"
          },
          "drill_down": [
            "Which movements are affected",
            "Whether others misread their expression",
            "Eye closure, dryness or drooling",
            "Whether it is improving, stable or worsening"
          ],
          "facets": [
            {
              "id": "movements",
              "label": "Which movements are affected: smile, brow, eye closure"
            },
            {
              "id": "symmetry",
              "label": "Whether expressions look even on both sides"
            },
            {
              "id": "eye_closure",
              "label": "Closing the eye fully; dryness or watering"
            },
            {
              "id": "oral_control",
              "label": "Drooling or the mouth not sealing"
            },
            {
              "id": "misread",
              "label": "Whether others misread how they feel"
            },
            {
              "id": "situations",
              "label": "Situations where it shows most"
            },
            {
              "id": "trend",
              "label": "Whether it is improving, stable or worsening"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Facial Expression"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Smiling"
            }
          ]
        },
        {
          "id": "function.swallowing_oral",
          "label": "Swallowing and oral control",
          "description": "Swallowing safely and comfortably, controlling saliva, and keeping the mouth closed; mainly relevant after head and neck treatment.",
          "severity_signals": {
            "none": "no swallowing or saliva problems",
            "mild": "occasional coughing with liquids or minor drooling",
            "moderate": "regular difficulty swallowing or drooling that needs managing in public",
            "severe": "swallowing unsafe or severely restricted; constant drooling"
          },
          "drill_down": [
            "Liquids, solids or both",
            "Coughing, choking or drooling episodes",
            "Diet changes or aids",
            "Whether it affects eating with others"
          ],
          "facets": [
            {
              "id": "consistencies",
              "label": "Liquids, solids or both"
            },
            {
              "id": "choking",
              "label": "Coughing, choking or food sticking"
            },
            {
              "id": "saliva",
              "label": "Controlling saliva and keeping the mouth closed"
            },
            {
              "id": "diet_aids",
              "label": "Diet changes, thickeners, tube or other aids"
            },
            {
              "id": "social",
              "label": "Whether it affects eating with other people"
            },
            {
              "id": "trend",
              "label": "Whether it is improving, stable or worsening"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Swallowing"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Drooling"
            },
            {
              "instrument": "face-q-head-neck-cancer",
              "scale": "Oral Competence"
            }
          ]
        }
      ]
    },
    {
      "id": "adverse",
      "label": "Adverse effects and symptoms",
      "weight": 0.8,
      "constructs": [
        {
          "id": "adverse.pain_discomfort",
          "label": "Pain, tightness or discomfort",
          "description": "Pain, aching, tightness, pressure or tenderness in the face or treated area; how constant it is and what it stops them doing.",
          "severity_signals": {
            "none": "no pain or discomfort",
            "mild": "occasional mild discomfort; no medication or limits",
            "moderate": "regular pain needing medication or limiting some activities",
            "severe": "constant or severe pain affecting sleep, eating or daily function"
          },
          "drill_down": [
            "Where and what it feels like",
            "What makes it better or worse",
            "Medication use",
            "Whether it is improving over time"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Where it is"
            },
            {
              "id": "quality",
              "label": "What it feels like: aching, tight, sharp, pressure"
            },
            {
              "id": "intensity",
              "label": "How bad it gets at its worst and how bad it usually is"
            },
            {
              "id": "pattern",
              "label": "When it comes: constant, with movement, at certain times"
            },
            {
              "id": "relief",
              "label": "What makes it better or worse, including medication"
            },
            {
              "id": "sleep_activity",
              "label": "Whether it affects sleep or stops them doing things"
            },
            {
              "id": "trajectory",
              "label": "Whether it is improving, stable or worsening"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "Whether the child says it hurts or shows signs of pain (rubbing, crying, not wanting to be touched).",
              "drill_down": [
                "How the child shows pain",
                "Whether pain relief is being used and helps"
              ]
            }
          },
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Symptoms"
            }
          ]
        },
        {
          "id": "adverse.swelling_bruising",
          "label": "Swelling, bruising and redness",
          "description": "Swelling, bruising, redness or lumpiness in the treated area; how visible it is and whether it is settling as expected.",
          "severity_signals": {
            "none": "none, or fully settled",
            "mild": "slight residual swelling only they notice",
            "moderate": "visible swelling or bruising they feel they must explain or hide",
            "severe": "marked swelling or bruising affecting function or keeping them at home"
          },
          "drill_down": [
            "Which areas and whether it is one-sided",
            "Trend since treatment",
            "Whether it affects vision, breathing or eating",
            "What they were told to expect"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Which areas are affected"
            },
            {
              "id": "extent",
              "label": "How visible it is to them and to other people"
            },
            {
              "id": "sidedness",
              "label": "Whether it is worse on one side"
            },
            {
              "id": "trajectory",
              "label": "How it has changed since treatment"
            },
            {
              "id": "function_effect",
              "label": "Whether it affects vision, breathing or eating"
            },
            {
              "id": "expectations",
              "label": "What they were told to expect"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Symptoms"
            }
          ]
        },
        {
          "id": "adverse.numbness_sensation",
          "label": "Numbness or altered sensation",
          "description": "Numbness, tingling, itching, oversensitivity or strange feelings in the face or treated area, and how much it bothers them.",
          "severity_signals": {
            "none": "normal sensation",
            "mild": "small numb patch they rarely notice",
            "moderate": "noticeable numbness or tingling that bothers them daily",
            "severe": "widespread or painful altered sensation affecting eating, speaking or comfort"
          },
          "drill_down": [
            "Location and extent",
            "Whether it is changing over time",
            "Whether it affects eating, drinking or shaving/makeup"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Where the altered feeling is"
            },
            {
              "id": "extent",
              "label": "How large an area, and whether feeling is fully or partly gone"
            },
            {
              "id": "quality",
              "label": "Numb, tingling, itching, oversensitive or burning"
            },
            {
              "id": "trajectory",
              "label": "Whether it is changing over time"
            },
            {
              "id": "daily_effect",
              "label": "Whether it affects eating, drinking, shaving or makeup"
            },
            {
              "id": "bother",
              "label": "How much it bothers them day to day"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Cheeks, Lower Face and Neck"
            }
          ]
        },
        {
          "id": "adverse.scarring",
          "label": "Scars",
          "description": "How the person feels about scars from surgery, injury or treatment: visibility, colour, texture, width, and whether they draw attention.",
          "severity_signals": {
            "none": "scars not noticeable or not a concern",
            "mild": "notices scars but they do not bother them much",
            "moderate": "scars are visible and bother them; some concealment",
            "severe": "scars dominate how they see their face; significant distress or avoidance"
          },
          "drill_down": [
            "Which scars and where",
            "Colour, texture or raised areas",
            "Whether they are still maturing",
            "Whether they use scar treatments or concealment"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Which scars and where"
            },
            {
              "id": "visibility",
              "label": "How noticeable they are to them and to other people"
            },
            {
              "id": "colour",
              "label": "Colour: red, dark or pale"
            },
            {
              "id": "texture",
              "label": "Raised, indented, firm or itchy"
            },
            {
              "id": "maturity",
              "label": "Whether they are still settling and how they have changed"
            },
            {
              "id": "concealment",
              "label": "Whether they cover them and how"
            },
            {
              "id": "care",
              "label": "Scar treatments they are using"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "How the child (and guardian) feel about the child's scars, including whether other children notice or ask.",
              "drill_down": [
                "Whether other children ask about the scar",
                "Whether the child wants to hide it"
              ]
            }
          },
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Appraisal of Scars"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Cleft Lip Scar"
            }
          ]
        },
        {
          "id": "adverse.asymmetry",
          "label": "Unevenness or asymmetry",
          "description": "Whether the person perceives one side of the face or a feature as different from the other, and how much it bothers them.",
          "severity_signals": {
            "none": "no asymmetry that concerns them",
            "mild": "slight unevenness only they notice",
            "moderate": "asymmetry they see in most photos and that others may notice",
            "severe": "asymmetry is highly visible to them; strong distress or avoidance"
          },
          "drill_down": [
            "Which feature or side",
            "Whether it is worse with movement or expression",
            "Whether it has changed since treatment"
          ],
          "facets": [
            {
              "id": "feature",
              "label": "Which feature looks uneven"
            },
            {
              "id": "side",
              "label": "Which side, and how different it looks to them"
            },
            {
              "id": "rest_vs_movement",
              "label": "Whether it shows more at rest or with expression"
            },
            {
              "id": "others_notice",
              "label": "Whether other people notice or comment"
            },
            {
              "id": "trajectory",
              "label": "Whether it has changed since treatment"
            },
            {
              "id": "bother",
              "label": "How much it bothers them"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Eyes"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Lips"
            }
          ]
        }
      ]
    },
    {
      "id": "recovery",
      "label": "Recovery and early life impact",
      "weight": 0.6,
      "constructs": [
        {
          "id": "recovery.daily_activities",
          "label": "Impact of recovery on daily life",
          "description": "In the weeks after treatment: ability to work, drive, exercise, sleep, care for others and go out; tiredness; and whether recovery is going as expected.",
          "severity_signals": {
            "none": "back to normal activities",
            "mild": "minor limits (e.g., no heavy exercise yet)",
            "moderate": "off work or missing regular activities; needs help with some tasks",
            "severe": "largely housebound or dependent on others; recovery much harder than expected"
          },
          "drill_down": [
            "Which activities are still limited",
            "Sleep and energy",
            "Support at home",
            "Whether recovery matches what they were told"
          ],
          "facets": [
            {
              "id": "work",
              "label": "Getting back to work or study"
            },
            {
              "id": "driving_exercise",
              "label": "Driving, exercise and lifting"
            },
            {
              "id": "sleep_energy",
              "label": "Sleep and energy levels"
            },
            {
              "id": "caring",
              "label": "Caring for children or others at home"
            },
            {
              "id": "going_out",
              "label": "Going out and being seen in public"
            },
            {
              "id": "support",
              "label": "Support they have at home"
            },
            {
              "id": "expectations",
              "label": "Whether recovery matches what they were told"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "Whether the child is back to school, play, sport and normal sleep, and how the family is managing care.",
              "drill_down": [
                "Days of school missed",
                "Whether they can play as usual",
                "How the family is coping"
              ]
            }
          },
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Life Impact"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Symptoms"
            }
          ]
        }
      ]
    },
    {
      "id": "outcome",
      "label": "Satisfaction with outcome, decision and information",
      "weight": 1.0,
      "constructs": [
        {
          "id": "outcome.result",
          "label": "Satisfaction with the result",
          "description": "After treatment: whether the result matches what the person hoped for, looks natural, was worth it, and whether they would choose it again.",
          "severity_signals": {
            "none": "pleased; result met or exceeded hopes",
            "mild": "mostly pleased with a small reservation",
            "moderate": "mixed; clear disappointment in one or more aspects",
            "severe": "regrets the treatment or feels worse than before"
          },
          "drill_down": [
            "What they hoped for versus what they see",
            "Which aspect disappoints, if any",
            "Whether they would do it again or recommend it",
            "Whether their view has shifted as healing progresses"
          ],
          "facets": [
            {
              "id": "expectation_vs_result",
              "label": "What they hoped for versus what they see"
            },
            {
              "id": "naturalness",
              "label": "Whether it looks natural and still like them"
            },
            {
              "id": "specific_aspect",
              "label": "Which aspect, if any, disappoints"
            },
            {
              "id": "others_reaction",
              "label": "What other people have said"
            },
            {
              "id": "worth_it",
              "label": "Whether it was worth what it took"
            },
            {
              "id": "choose_again",
              "label": "Whether they would choose it again or recommend it"
            },
            {
              "id": "view_shift",
              "label": "Whether their view has shifted as healing progresses"
            }
          ],
          "age_variants": {
            "pediatric": {
              "description": "Whether the child and guardian are pleased with the result and whether it is what they expected.",
              "drill_down": [
                "What the child says about the change",
                "Whether the guardian's hopes were met"
              ]
            }
          },
          "priority": "core",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Outcome"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Expectations"
            }
          ]
        },
        {
          "id": "outcome.decision",
          "label": "Satisfaction with the decision to have treatment",
          "description": "Whether the person feels the decision to have treatment was right for them, made with enough time and without pressure, and whether they have any regret.",
          "severity_signals": {
            "none": "confident the decision was right",
            "mild": "small doubts but glad overall",
            "moderate": "meaningful second thoughts or felt rushed",
            "severe": "regrets the decision or felt pressured into it"
          },
          "drill_down": [
            "What influenced the decision",
            "Whether they felt rushed or pressured",
            "Whether they would advise someone else to do it"
          ],
          "facets": [
            {
              "id": "influences",
              "label": "What influenced the decision"
            },
            {
              "id": "timing",
              "label": "Whether the timing felt right"
            },
            {
              "id": "pressure",
              "label": "Whether they felt rushed or pressured"
            },
            {
              "id": "alternatives",
              "label": "Whether other options were considered"
            },
            {
              "id": "regret",
              "label": "Any regret, and what about"
            },
            {
              "id": "advise_others",
              "label": "Whether they would advise someone else to do it"
            }
          ],
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Decision"
            }
          ]
        },
        {
          "id": "outcome.information",
          "label": "Satisfaction with information received",
          "description": "Whether the person felt well informed before and after treatment about what to expect, recovery, risks and how to care for themselves.",
          "severity_signals": {
            "none": "felt fully informed",
            "mild": "a few things they wish they had been told",
            "moderate": "important gaps; surprised by parts of recovery or result",
            "severe": "felt uninformed or misled; major unexpected consequences"
          },
          "drill_down": [
            "What they wish they had known",
            "Whether written or spoken information was clear",
            "Questions they still have for the team"
          ],
          "facets": [
            {
              "id": "before",
              "label": "What they were told to expect beforehand"
            },
            {
              "id": "recovery_info",
              "label": "Information about recovery and timescales"
            },
            {
              "id": "risks",
              "label": "How risks and possible complications were explained"
            },
            {
              "id": "self_care",
              "label": "How to care for themselves afterwards"
            },
            {
              "id": "clarity",
              "label": "Whether written and spoken information was clear"
            },
            {
              "id": "gaps",
              "label": "What they wish they had known, and questions still open"
            }
          ],
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Information"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Satisfaction with Information"
            }
          ]
        }
      ]
    },
    {
      "id": "aging",
      "label": "Age appraisal",
      "weight": 0.6,
      "constructs": [
        {
          "id": "aging.appraisal",
          "label": "How old the face looks versus how the person feels",
          "description": "Whether the person feels their face looks older than they are or feel, which features signal age to them (lines, sagging, tiredness), and how much this bothers them.",
          "severity_signals": {
            "none": "feels they look their age or younger; not a concern",
            "mild": "occasionally feels they look tired or older",
            "moderate": "regularly bothered by looking older; compares to peers",
            "severe": "looking older is a persistent distress affecting confidence or work"
          },
          "drill_down": [
            "Which features signal age to them",
            "Whether others comment on tiredness or age",
            "Whether it affects work or relationships",
            "What they hope treatment will change"
          ],
          "facets": [
            {
              "id": "perceived_vs_actual",
              "label": "How old their face looks versus their age"
            },
            {
              "id": "feels_inside",
              "label": "How old they feel inside compared with how they look"
            },
            {
              "id": "features",
              "label": "Which features signal age to them: lines, sagging, tiredness"
            },
            {
              "id": "comments",
              "label": "Whether others comment on tiredness or age"
            },
            {
              "id": "situations",
              "label": "Situations where it matters: work, dating, photos"
            },
            {
              "id": "wanted_change",
              "label": "What they hope would change"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Appraisal of Aging Appearance"
            }
          ]
        }
      ]
    }
  ],
  "triage": [
    {
      "id": "overall",
      "intent": "How they feel overall about how their face looks right now",
      "maps_to": [
        "appearance.overall"
      ]
    },
    {
      "id": "features",
      "intent": "Which parts of their face are on their mind most (let them name features)",
      "maps_to": [
        "appearance.*"
      ]
    },
    {
      "id": "function",
      "intent": "Whether anything about the face makes everyday things harder: breathing, eating, speaking, expressions",
      "maps_to": [
        "function.*"
      ]
    },
    {
      "id": "impact",
      "intent": "How it affects how they feel about themselves and what they do socially",
      "maps_to": [
        "psych.*",
        "social.*",
        "distress.*"
      ]
    },
    {
      "id": "recovery",
      "intent": "How recovery is going: pain, swelling, numbness, scarring",
      "maps_to": [
        "adverse.*",
        "recovery.*"
      ],
      "timepoints": [
        "post-op-2w",
        "post-op-6w",
        "post-op-6m",
        "post-op-12m",
        "follow-up"
      ]
    }
  ],
  "coverage_rules": {
    "min_confidence_to_count": 0.6,
    "drill_down_threshold": "moderate",
    "core_constructs_required": true,
    "max_constructs_per_session": 18,
    "focus_facet_threshold": 0.7
  }
}$seed$::jsonb,
  'approved',
  null,
  now()
)
on conflict (slug, version) do update set
  population = excluded.population,
  source_instrument_ids = excluded.source_instrument_ids,
  map = excluded.map,
  status = 'approved',
  approved_at = coalesce(public.construct_maps.approved_at, now());

insert into public.construct_maps (id, slug, version, population, source_instrument_ids, map, status, approved_by, approved_at)
values (
  '7a1c5e20-0002-4a00-8000-000000000012',
  $seed$face-q-pediatric$seed$,
  2,
  $seed$pediatric$seed$,
  array['6d2f3a10-0001-4a00-8000-000000000001', '6d2f3a10-0001-4a00-8000-000000000002', '6d2f3a10-0001-4a00-8000-000000000004']::uuid[],
  $seed${
  "slug": "face-q-pediatric",
  "version": 2,
  "population": "pediatric",
  "language": "en",
  "notes": "Built from publicly documented FACE-Q Craniofacial Module scale names (with Aesthetics/Skin Cancer scales where they apply) and what those scales measure. Descriptions are paraphrased constructs; no questionnaire item text is included. Conversations may be with the child (self), a guardian speaking about the child (guardian), or both; drill-down cues address the guardian view where useful. For satisfaction-type constructs, 'severity' expresses the degree of dissatisfaction or concern. Constructs with 'applicable_timepoints' are only active at those timepoints (extension to SPEC §6, see seed/README.md). Construct ids are shared with face-q-adult where the construct is the same so diagnosis focus lists work across both maps. Version 2 adds SPEC v1.1 facets (5-8 paraphrased, clinician-relevant details per construct, explored when the construct is a focus) and the top-level triage block asked at the start of every session.",
  "domains": [
    {
      "id": "appearance",
      "label": "Satisfaction with facial appearance",
      "weight": 1.0,
      "constructs": [
        {
          "id": "appearance.overall",
          "label": "How the child feels about their face overall",
          "description": "How the child feels about their face as a whole: in the mirror, in school photos, on video, and compared with friends and siblings. If the guardian answers: what the child says and shows about their face.",
          "severity_signals": {
            "none": "happy with or unbothered by their face",
            "mild": "sometimes mentions something they would change; no avoidance",
            "moderate": "often unhappy about their face; avoids photos or mirrors sometimes",
            "severe": "very upset about their face; avoidance or upset that affects school or play"
          },
          "drill_down": [
            "Which part of the face bothers them most",
            "Teasing or comments from other children",
            "Whether they avoid photos, mirrors or activities",
            "What the child hopes will change",
            "Whether the guardian's view matches the child's"
          ],
          "facets": [
            {
              "id": "whole_face",
              "label": "How the child feels about their face as a whole"
            },
            {
              "id": "features_named",
              "label": "Which part of the face is most on their mind"
            },
            {
              "id": "compared_to_peers",
              "label": "How they think they compare with friends and siblings"
            },
            {
              "id": "photos_mirror",
              "label": "School photos, videos and mirrors"
            },
            {
              "id": "others_comments",
              "label": "Comments or questions from other children"
            },
            {
              "id": "wanted_change",
              "label": "What the child says they would want different"
            },
            {
              "id": "guardian_view",
              "label": "Whether the guardian's view matches what the child says"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Face"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Facial Appearance Overall"
            }
          ]
        },
        {
          "id": "appearance.nose",
          "label": "How the child feels about their nose",
          "description": "How the child feels about the shape and size of their nose and nostrils, from the front and the side, and whether it looks like other children's.",
          "severity_signals": {
            "none": "not bothered by their nose",
            "mild": "occasionally mentions it",
            "moderate": "often bothered; notices it in photos or when others look",
            "severe": "nose is a constant worry; hides it or gets very upset about it"
          },
          "drill_down": [
            "Nostril shape, tip, width or profile",
            "Whether other children comment",
            "Whether breathing is also a problem"
          ],
          "facets": [
            {
              "id": "shape",
              "label": "Shape of the nose"
            },
            {
              "id": "size",
              "label": "Size and width of the nose"
            },
            {
              "id": "nostrils",
              "label": "Nostrils: shape and whether they match"
            },
            {
              "id": "profile_vs_front",
              "label": "How it looks from the side versus straight on"
            },
            {
              "id": "breathing_link",
              "label": "Whether breathing through the nose is also a problem"
            },
            {
              "id": "others_comments",
              "label": "Whether other children notice or ask about it"
            },
            {
              "id": "wanted_change",
              "label": "What the child would want different"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Nose"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Nostrils"
            }
          ]
        },
        {
          "id": "appearance.eyes",
          "label": "How the child feels about their eyes",
          "description": "How the child feels about the look of their eyes and eyelids, including whether they look even and whether other children notice.",
          "severity_signals": {
            "none": "not bothered by their eyes",
            "mild": "sometimes notices a difference",
            "moderate": "often bothered; unevenness or shape is a regular worry",
            "severe": "eyes are a major source of upset; hides them or avoids being looked at"
          },
          "drill_down": [
            "Shape, position, eyelids or evenness",
            "Whether glasses or patches are involved and how they feel about them",
            "Whether vision is affected"
          ],
          "facets": [
            {
              "id": "shape",
              "label": "Shape of the eyes"
            },
            {
              "id": "symmetry",
              "label": "Whether the two eyes match"
            },
            {
              "id": "position",
              "label": "Where they sit on the face and how far apart"
            },
            {
              "id": "lids",
              "label": "Eyelids and the area under the eyes"
            },
            {
              "id": "vision_glasses",
              "label": "Vision, glasses or patching and how the child feels about them"
            },
            {
              "id": "others_notice",
              "label": "Whether other children notice or ask"
            },
            {
              "id": "wanted_change",
              "label": "What the child would want different"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Eyes"
            }
          ]
        },
        {
          "id": "appearance.lips",
          "label": "How the child feels about their lips",
          "description": "How the child feels about the shape, evenness and look of their lips and the area above the lip, including any cleft-related differences.",
          "severity_signals": {
            "none": "not bothered by their lips",
            "mild": "sometimes notices a difference",
            "moderate": "often bothered; covers their mouth or avoids smiling in photos",
            "severe": "lips are a constant worry; strongly avoids smiling or being looked at"
          },
          "drill_down": [
            "Shape, evenness or the area above the lip",
            "Whether they cover their mouth when smiling or laughing",
            "Whether other children ask about it"
          ],
          "facets": [
            {
              "id": "shape",
              "label": "Shape and fullness of the lips"
            },
            {
              "id": "evenness",
              "label": "Whether the two sides look even"
            },
            {
              "id": "above_lip",
              "label": "The area between the lip and the nose, including any repair line"
            },
            {
              "id": "movement",
              "label": "How the lips move when smiling, talking or eating"
            },
            {
              "id": "others_ask",
              "label": "Whether other children ask about it"
            },
            {
              "id": "covering",
              "label": "Whether they cover their mouth"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Lips"
            }
          ]
        },
        {
          "id": "appearance.ears",
          "label": "How the child feels about their ears",
          "description": "How the child feels about the size, shape, position and evenness of their ears, including whether they hide them with hair or hats.",
          "severity_signals": {
            "none": "not bothered by their ears",
            "mild": "sometimes notices; no hiding",
            "moderate": "often bothered; hides ears with hair or hats",
            "severe": "ears are a major upset; refuses haircuts, swimming or activities that expose them"
          },
          "drill_down": [
            "Size, shape, position or one side versus the other",
            "Whether they hide their ears (hair, hats)",
            "Whether hearing aids or hearing are part of it",
            "Whether other children comment"
          ],
          "facets": [
            {
              "id": "size",
              "label": "Size of the ears"
            },
            {
              "id": "shape",
              "label": "Shape and folds of the ears"
            },
            {
              "id": "position",
              "label": "How far they stick out and where they sit"
            },
            {
              "id": "sidedness",
              "label": "Whether one ear is different from the other"
            },
            {
              "id": "hiding",
              "label": "Whether they hide their ears with hair or hats"
            },
            {
              "id": "hearing",
              "label": "Hearing, hearing aids and how the child feels about them"
            },
            {
              "id": "others_comments",
              "label": "Whether other children notice or comment"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Ears"
            }
          ]
        },
        {
          "id": "appearance.cheeks",
          "label": "How the child feels about their cheeks and mid-face",
          "description": "How the child feels about the shape and evenness of their cheeks and the middle part of the face, including whether one side looks different.",
          "severity_signals": {
            "none": "not bothered",
            "mild": "sometimes notices flatness or unevenness",
            "moderate": "often bothered by unevenness",
            "severe": "cheek appearance is a major upset; avoids photos or certain angles"
          },
          "drill_down": [
            "Whether one side looks different",
            "Whether it is more noticeable when smiling",
            "Whether it has changed with growth or treatment"
          ],
          "facets": [
            {
              "id": "shape",
              "label": "Shape and fullness of the cheeks"
            },
            {
              "id": "evenness",
              "label": "Whether one side looks different"
            },
            {
              "id": "with_smiling",
              "label": "Whether it shows more when smiling or talking"
            },
            {
              "id": "growth_change",
              "label": "Whether it has changed with growth or treatment"
            },
            {
              "id": "others_notice",
              "label": "Whether other children notice"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Cheeks"
            }
          ]
        },
        {
          "id": "appearance.chin_jawline",
          "label": "How the child feels about their chin and jaw",
          "description": "How the child feels about the size, shape and position of their chin and jaw, including whether the jaw looks uneven or set back.",
          "severity_signals": {
            "none": "not bothered",
            "mild": "sometimes notices",
            "moderate": "often bothered; unevenness or profile is a regular worry",
            "severe": "chin or jaw is a major upset; avoids side views or photos"
          },
          "drill_down": [
            "Chin size, jaw evenness or profile",
            "Whether chewing or bite is also affected",
            "Whether it has changed with growth"
          ],
          "facets": [
            {
              "id": "chin_size",
              "label": "Size and shape of the chin"
            },
            {
              "id": "jaw_position",
              "label": "Whether the jaw looks set back or forward"
            },
            {
              "id": "evenness",
              "label": "Whether the jaw sits evenly"
            },
            {
              "id": "profile",
              "label": "How it looks from the side"
            },
            {
              "id": "bite_chewing",
              "label": "Whether the bite or chewing is affected"
            },
            {
              "id": "growth_change",
              "label": "Whether it has changed as they grow"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Chin"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Jaw"
            }
          ]
        },
        {
          "id": "appearance.smile_teeth",
          "label": "How the child feels about their smile and teeth",
          "description": "How the child feels about their smile and teeth: whether the smile looks even and natural, and whether teeth, gums or the lip line make them hold back from smiling.",
          "severity_signals": {
            "none": "smiles freely",
            "mild": "sometimes self-conscious about smiling",
            "moderate": "often holds back or covers their smile",
            "severe": "avoids smiling or laughing in front of others"
          },
          "drill_down": [
            "Teeth, gums, evenness or lip movement",
            "Whether they cover their mouth when laughing",
            "Whether braces or dental treatment are involved",
            "Whether it matters more in photos or with friends"
          ],
          "facets": [
            {
              "id": "teeth_show",
              "label": "How the teeth look when they smile"
            },
            {
              "id": "lip_movement",
              "label": "How the lips move when smiling or laughing"
            },
            {
              "id": "gums",
              "label": "How much gum shows"
            },
            {
              "id": "symmetry",
              "label": "Whether the smile is even on both sides"
            },
            {
              "id": "braces_dental",
              "label": "Braces or dental treatment and how they feel about it"
            },
            {
              "id": "covering_mouth",
              "label": "Whether they cover their mouth when laughing or in photos"
            },
            {
              "id": "situations",
              "label": "Photos, school and being with friends"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Smile"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Teeth"
            }
          ]
        },
        {
          "id": "appearance.skin",
          "label": "How the child feels about the skin on their face",
          "description": "How the child feels about the colour, texture and evenness of the skin on their face, including birthmarks, patches or changes after treatment.",
          "severity_signals": {
            "none": "not bothered",
            "mild": "sometimes notices",
            "moderate": "often bothered; wants to cover it",
            "severe": "skin is a major upset; avoids being seen without covering it"
          },
          "drill_down": [
            "Colour, patches, texture or marks",
            "Whether other children ask about it",
            "Whether they try to cover it"
          ],
          "facets": [
            {
              "id": "colour",
              "label": "Colour and evenness of the skin"
            },
            {
              "id": "texture",
              "label": "Texture: rough, raised or smooth areas"
            },
            {
              "id": "marks",
              "label": "Birthmarks, patches or marks left after treatment"
            },
            {
              "id": "areas",
              "label": "Which parts of the face"
            },
            {
              "id": "covering",
              "label": "Whether they try to cover it"
            },
            {
              "id": "others_ask",
              "label": "Whether other children ask about it"
            }
          ],
          "priority": "optional",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Skin"
            }
          ]
        }
      ]
    },
    {
      "id": "psychological",
      "label": "Psychological function",
      "weight": 1.0,
      "constructs": [
        {
          "id": "psych.self_confidence",
          "label": "Confidence and feeling good about oneself",
          "description": "How sure of themselves the child feels around other children and adults, whether they feel 'like everyone else', and whether their face makes them feel different or less good about themselves. Guardian view: how the child's confidence shows at home and out and about.",
          "severity_signals": {
            "none": "confident; feels like the other kids",
            "mild": "confidence dips in some situations (new people, performances)",
            "moderate": "often lacks confidence because of their face; hangs back",
            "severe": "very low confidence; says or shows they feel different or not good enough most of the time"
          },
          "drill_down": [
            "Situations where confidence drops (new class, sports, performances)",
            "Activities where they feel good about themselves",
            "Whether the guardian has noticed a change over the past months",
            "Whether the child says they feel different from other children"
          ],
          "facets": [
            {
              "id": "situations",
              "label": "Situations where confidence drops: a new class, sport, performances"
            },
            {
              "id": "feeling_different",
              "label": "Whether they feel different from other children"
            },
            {
              "id": "strengths",
              "label": "Activities where they feel good about themselves"
            },
            {
              "id": "frequency",
              "label": "How often this shows in a typical week"
            },
            {
              "id": "what_helps",
              "label": "What helps them feel more sure of themselves"
            },
            {
              "id": "trend",
              "label": "Whether the guardian has noticed a change over recent months"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            }
          ]
        },
        {
          "id": "psych.self_acceptance",
          "label": "Accepting how they look",
          "description": "Whether the child accepts their face as part of who they are, or often wishes they looked different; how they talk about their face when it comes up.",
          "severity_signals": {
            "none": "accepts their face; talks about it matter-of-factly",
            "mild": "mostly accepting; occasional wishes to look different",
            "moderate": "often wishes they looked different; upset when it comes up",
            "severe": "cannot accept how they look; strong sense of being defined by their face"
          },
          "drill_down": [
            "How the child explains their face to others",
            "Whether they ask why they look different",
            "What helps them feel okay about it"
          ],
          "facets": [
            {
              "id": "self_talk",
              "label": "How the child talks about their face when it comes up"
            },
            {
              "id": "explaining",
              "label": "How they explain their face to other children"
            },
            {
              "id": "wishing_different",
              "label": "Whether they often wish they looked different"
            },
            {
              "id": "what_helps",
              "label": "What helps them feel okay about it"
            },
            {
              "id": "trend",
              "label": "Whether this is changing as they get older"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        },
        {
          "id": "psych.mood",
          "label": "Sadness, worry or anger about their face",
          "description": "Whether the child seems sad, worried, frustrated or angry because of their face or its treatment; how often, and how the guardian sees it affecting them at home (sleep, tears, withdrawal, anger).",
          "severity_signals": {
            "none": "mood not affected by their face",
            "mild": "occasional bad days linked to their face or appointments",
            "moderate": "regular sadness or worry about their face; recovers with comfort or distraction",
            "severe": "persistent sadness, worry or anger affecting sleep, appetite, school or play"
          },
          "drill_down": [
            "Signs the guardian notices (withdrawal, tears, anger, sleep)",
            "Whether it is worse around school events, photos or hospital visits",
            "Whether the child has talked to anyone about it",
            "Whether treatment has changed this"
          ],
          "facets": [
            {
              "id": "signs",
              "label": "What the guardian sees: tears, withdrawal, anger, clinginess"
            },
            {
              "id": "frequency",
              "label": "How often it happens and how long it lasts"
            },
            {
              "id": "triggers",
              "label": "School events, photos, hospital visits"
            },
            {
              "id": "sleep_appetite",
              "label": "Whether sleep or appetite are affected"
            },
            {
              "id": "child_words",
              "label": "What the child says about how they feel"
            },
            {
              "id": "support",
              "label": "Whether they have talked to anyone: guardian, teacher, counsellor"
            },
            {
              "id": "trend",
              "label": "Whether time or treatment has changed this"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Psychological Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        }
      ]
    },
    {
      "id": "social",
      "label": "Social function",
      "weight": 1.0,
      "constructs": [
        {
          "id": "social.comfort",
          "label": "Comfort with friends and in play",
          "description": "How comfortable the child is with friends, at parties, in group play and sport, and meeting new children; whether they join in or hang back.",
          "severity_signals": {
            "none": "joins in freely; has friends they feel relaxed with",
            "mild": "slightly shy with new children; fine with friends",
            "moderate": "often hangs back; prefers one or two familiar friends or adults",
            "severe": "very uncomfortable with other children; isolated or refuses group activities"
          },
          "drill_down": [
            "Whether they have close friends",
            "Whether they join in at break time, parties, sport",
            "Whether new settings (new class, clubs) are hard",
            "What helps them feel comfortable"
          ],
          "facets": [
            {
              "id": "friendships",
              "label": "Whether they have close friends"
            },
            {
              "id": "group_play",
              "label": "Break time, group play and sport"
            },
            {
              "id": "parties_clubs",
              "label": "Parties, clubs and other new settings"
            },
            {
              "id": "new_children",
              "label": "Meeting children they do not know"
            },
            {
              "id": "joining_in",
              "label": "Whether they join in or hang back"
            },
            {
              "id": "what_helps",
              "label": "What helps them feel comfortable"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            }
          ]
        },
        {
          "id": "social.school",
          "label": "School participation",
          "description": "How the child is doing at school: attendance, taking part in class and activities, concentration, and whether their face, its treatment or other children's reactions get in the way.",
          "severity_signals": {
            "none": "attends and takes part fully",
            "mild": "occasional reluctance (class photos, presentations)",
            "moderate": "regularly avoids some school activities or misses days because of their face or treatment",
            "severe": "school refusal, frequent absence or major withdrawal linked to their face"
          },
          "drill_down": [
            "Days missed and why",
            "Activities they avoid (speaking in class, sport, photos)",
            "Whether the school knows and helps",
            "Whether schoolwork or concentration is affected"
          ],
          "facets": [
            {
              "id": "attendance",
              "label": "Days missed and the reasons"
            },
            {
              "id": "participation",
              "label": "Speaking up in class and taking part"
            },
            {
              "id": "activities_avoided",
              "label": "Activities they avoid: sport, swimming, photos, performances"
            },
            {
              "id": "concentration",
              "label": "Whether schoolwork or concentration is affected"
            },
            {
              "id": "school_support",
              "label": "Whether the school knows and what they do to help"
            },
            {
              "id": "peer_reactions",
              "label": "How other children at school react"
            },
            {
              "id": "trend",
              "label": "Whether it is getting easier or harder"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "School Function"
            }
          ]
        },
        {
          "id": "social.teasing_comments",
          "label": "Teasing, staring and questions from others",
          "description": "Whether the child is teased, stared at, asked questions or left out at school or in play because of their face; how they respond and whether they tell the guardian.",
          "severity_signals": {
            "none": "no teasing or comments that bother them",
            "mild": "occasional questions or looks they handle well",
            "moderate": "regular comments or teasing that upset them or that they plan around",
            "severe": "bullying or exclusion; significant hurt, fear or avoidance of school"
          },
          "drill_down": [
            "Who it comes from and where it happens",
            "Whether the child tells the guardian or a teacher",
            "Whether the school knows and what they have done",
            "Whether the child has a comeback or plan for questions"
          ],
          "facets": [
            {
              "id": "source",
              "label": "Who it comes from"
            },
            {
              "id": "setting",
              "label": "Where it happens: school, clubs, online, family"
            },
            {
              "id": "nature",
              "label": "Staring, questions, teasing or being left out"
            },
            {
              "id": "frequency",
              "label": "How often it happens"
            },
            {
              "id": "child_response",
              "label": "How the child responds, and whether they have a plan for questions"
            },
            {
              "id": "telling_adults",
              "label": "Whether they tell a guardian or teacher"
            },
            {
              "id": "school_action",
              "label": "What the school or club has done about it"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        },
        {
          "id": "social.avoidance",
          "label": "Avoiding activities because of their face",
          "description": "Whether the child avoids photos, parties, swimming, sport, performances or meeting new people because of how their face looks or works.",
          "severity_signals": {
            "none": "no avoidance",
            "mild": "occasionally opts out of photos or new activities",
            "moderate": "regularly avoids some activities because of their face",
            "severe": "withdrawn from most activities outside home"
          },
          "drill_down": [
            "Specific activities skipped recently",
            "How often in the last month",
            "Whether the guardian has changed family plans because of it"
          ],
          "facets": [
            {
              "id": "activities",
              "label": "Activities they have skipped: parties, swimming, sport, performances"
            },
            {
              "id": "frequency",
              "label": "How often in the last month"
            },
            {
              "id": "photos",
              "label": "Avoiding photos or videos"
            },
            {
              "id": "new_people",
              "label": "Avoiding meeting new children or adults"
            },
            {
              "id": "family_plans",
              "label": "Whether family plans have changed because of it"
            },
            {
              "id": "conditions",
              "label": "What would need to be true for them to join in"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Social Function"
            }
          ]
        }
      ]
    },
    {
      "id": "distress",
      "label": "Appearance-related distress",
      "weight": 1.0,
      "constructs": [
        {
          "id": "distress.preoccupation",
          "label": "Worrying about or checking their face",
          "description": "How often the child talks about, checks, or worries about their face; whether they compare themselves with others; whether the guardian sees this taking up a lot of the child's attention.",
          "severity_signals": {
            "none": "rarely mentions or thinks about it",
            "mild": "brings it up now and then; easily reassured",
            "moderate": "brings it up most days; checks mirrors or photos; needs reassurance",
            "severe": "constant worry or checking that is hard to interrupt; upset when reassured"
          },
          "drill_down": [
            "How often it comes up in a typical week",
            "Mirror or photo checking, comparing with others",
            "Whether it affects sleep or concentration",
            "When it started or got worse"
          ],
          "facets": [
            {
              "id": "frequency",
              "label": "How often it comes up in a typical week"
            },
            {
              "id": "checking",
              "label": "Mirror or photo checking"
            },
            {
              "id": "comparing",
              "label": "Comparing themselves with other children"
            },
            {
              "id": "reassurance",
              "label": "Asking the guardian whether they look okay"
            },
            {
              "id": "interference",
              "label": "Whether it affects sleep or concentration"
            },
            {
              "id": "onset",
              "label": "When it started or got worse"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        },
        {
          "id": "distress.hiding",
          "label": "Hiding their face or a feature",
          "description": "Whether the child tries to hide their face or a feature: hair over the face or ears, hats, hands over the mouth, turning away in photos, or refusing haircuts or swimming.",
          "severity_signals": {
            "none": "no hiding",
            "mild": "hides sometimes (photos, new people)",
            "moderate": "hides most days; upset if they cannot",
            "severe": "will not be seen without hiding; refuses activities that would expose the feature"
          },
          "drill_down": [
            "What they hide and how",
            "Whether it affects haircuts, swimming, sport or uniform rules",
            "How they react if they cannot hide"
          ],
          "facets": [
            {
              "id": "methods",
              "label": "What they use: hair, hats, hands, turning away"
            },
            {
              "id": "situations",
              "label": "When they do it most"
            },
            {
              "id": "haircuts_swimming",
              "label": "Whether it affects haircuts, swimming or sport"
            },
            {
              "id": "photos",
              "label": "Turning away from or refusing photos"
            },
            {
              "id": "if_unable",
              "label": "How they react if they cannot hide it"
            },
            {
              "id": "rules",
              "label": "Whether uniform or club rules get in the way"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance Distress"
            }
          ]
        }
      ]
    },
    {
      "id": "function",
      "label": "Facial function",
      "weight": 1.0,
      "constructs": [
        {
          "id": "function.breathing",
          "label": "Breathing through the nose",
          "description": "Whether the child breathes easily through their nose during the day, during play or sport, and at night; mouth breathing, snoring or disturbed sleep.",
          "severity_signals": {
            "none": "breathes easily through the nose",
            "mild": "occasional blockage (colds, one side, at night)",
            "moderate": "regularly mouth-breathes, snores or tires during play",
            "severe": "constant obstruction; poor sleep, restless nights or limits on activity"
          },
          "drill_down": [
            "One side or both; day or night",
            "Snoring, restless sleep or tiredness",
            "Whether it limits running or sport",
            "Whether it changed after surgery"
          ],
          "facets": [
            {
              "id": "sides",
              "label": "One side or both"
            },
            {
              "id": "day_night",
              "label": "Daytime versus at night"
            },
            {
              "id": "play_sport",
              "label": "Breathing when running, playing or doing sport"
            },
            {
              "id": "sleep",
              "label": "Snoring, restless sleep and daytime tiredness"
            },
            {
              "id": "mouth_breathing",
              "label": "Mouth breathing and a dry mouth"
            },
            {
              "id": "trajectory",
              "label": "Whether it changed after surgery or treatment"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Breathing"
            }
          ]
        },
        {
          "id": "function.eating_drinking",
          "label": "Eating and drinking",
          "description": "Whether the child can bite, chew, keep food and drink in the mouth, eat a normal range of foods, and eat comfortably at school or with others; food or liquid coming out of the nose.",
          "severity_signals": {
            "none": "eats and drinks normally",
            "mild": "avoids a few foods or is a slow eater",
            "moderate": "regular difficulty chewing, spilling or leaking; avoids eating in front of others",
            "severe": "eating is a daily struggle; growth, nutrition or school meals significantly affected"
          },
          "drill_down": [
            "Which foods or textures are hard",
            "Spilling, leaking or food coming through the nose",
            "Whether they avoid eating at school or with friends",
            "Growth or weight concerns"
          ],
          "facets": [
            {
              "id": "foods",
              "label": "Which foods or textures are hard"
            },
            {
              "id": "chewing",
              "label": "Biting and chewing"
            },
            {
              "id": "containment",
              "label": "Spilling or leaking from the mouth"
            },
            {
              "id": "nasal_escape",
              "label": "Food or drink coming down the nose"
            },
            {
              "id": "school_meals",
              "label": "Eating at school or with friends"
            },
            {
              "id": "time_effort",
              "label": "How long meals take and how tiring they are"
            },
            {
              "id": "growth",
              "label": "Growth, weight and how much they get through"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Eating and Drinking"
            }
          ]
        },
        {
          "id": "function.speaking",
          "label": "Speaking and being understood",
          "description": "How clearly the child speaks, whether strangers, teachers and other children understand them, whether speech sounds nasal, and whether they hold back from talking because of it.",
          "severity_signals": {
            "none": "speech is clear and easy",
            "mild": "occasionally asked to repeat; a few sounds are harder",
            "moderate": "regularly not understood by people outside the family; holds back in class",
            "severe": "speech seriously limits communication at school; relies on family to interpret"
          },
          "drill_down": [
            "Which sounds or situations are hardest",
            "Whether teachers or other children understand them",
            "Whether they avoid speaking up or reading aloud",
            "Speech therapy and progress"
          ],
          "facets": [
            {
              "id": "clarity",
              "label": "How clear their speech is"
            },
            {
              "id": "hard_sounds",
              "label": "Which sounds or words are hardest"
            },
            {
              "id": "listeners",
              "label": "Whether teachers, other children and strangers understand them"
            },
            {
              "id": "nasal_sound",
              "label": "Whether speech sounds nasal or air escapes"
            },
            {
              "id": "speaking_up",
              "label": "Speaking up in class or reading aloud"
            },
            {
              "id": "holding_back",
              "label": "Whether they say less because of it"
            },
            {
              "id": "therapy",
              "label": "Speech therapy and how it is going"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Speaking"
            }
          ]
        },
        {
          "id": "function.facial_expression",
          "label": "Facial expression and movement",
          "description": "Whether the child can smile, frown, raise their eyebrows, close their eyes and show feelings with their face; whether expressions look even and whether others misread them.",
          "severity_signals": {
            "none": "full, natural expression",
            "mild": "slight unevenness the family notices",
            "moderate": "expressions look uneven or limited; others misread their mood",
            "severe": "cannot show feelings with the face; eye closure or lip problems"
          },
          "drill_down": [
            "Which movements are affected",
            "Whether others misread their expression",
            "Eye closure, dryness or drooling",
            "Whether it is improving, stable or worsening"
          ],
          "facets": [
            {
              "id": "movements",
              "label": "Which movements are affected: smile, brow, eye closure"
            },
            {
              "id": "symmetry",
              "label": "Whether expressions look even on both sides"
            },
            {
              "id": "eye_closure",
              "label": "Closing the eye fully; dryness or watering"
            },
            {
              "id": "oral_control",
              "label": "Drooling or the mouth not sealing"
            },
            {
              "id": "misread",
              "label": "Whether other children or adults misread how they feel"
            },
            {
              "id": "trend",
              "label": "Whether it is improving, stable or worsening"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Facial Expression"
            }
          ]
        }
      ]
    },
    {
      "id": "adverse",
      "label": "Adverse effects and symptoms",
      "weight": 0.8,
      "constructs": [
        {
          "id": "adverse.pain_discomfort",
          "label": "Pain or discomfort",
          "description": "Whether the child says it hurts or shows signs of pain (rubbing, crying, not wanting to be touched, not eating) in the face or treated area; how constant it is and what it stops them doing.",
          "severity_signals": {
            "none": "no pain or discomfort",
            "mild": "occasional mild discomfort; no pain relief needed",
            "moderate": "regular pain needing pain relief or limiting play or eating",
            "severe": "constant or severe pain affecting sleep, eating or daily function"
          },
          "drill_down": [
            "Where it hurts and how the child shows it",
            "What makes it better or worse",
            "Pain relief used and whether it helps",
            "Whether it is improving"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Where it hurts"
            },
            {
              "id": "how_shown",
              "label": "How the child shows it: words, rubbing, crying, not eating"
            },
            {
              "id": "intensity",
              "label": "How bad it gets at its worst"
            },
            {
              "id": "pattern",
              "label": "When it comes: constant, at night, with eating or moving"
            },
            {
              "id": "relief",
              "label": "Pain relief used and whether it helps"
            },
            {
              "id": "sleep_activity",
              "label": "Whether it affects sleep, school or play"
            },
            {
              "id": "trajectory",
              "label": "Whether it is getting better"
            }
          ],
          "priority": "core",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Symptoms"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            }
          ]
        },
        {
          "id": "adverse.swelling_bruising",
          "label": "Swelling, bruising and redness",
          "description": "Swelling, bruising, redness or lumpiness in the treated area; how visible it is and whether it is settling as the family was told to expect.",
          "severity_signals": {
            "none": "none, or fully settled",
            "mild": "slight swelling only the family notices",
            "moderate": "visible swelling or bruising that other children comment on",
            "severe": "marked swelling affecting eating, breathing or vision, or keeping the child home"
          },
          "drill_down": [
            "Which areas and whether it is one-sided",
            "Trend since treatment",
            "Whether it affects eating, breathing or vision",
            "What the family was told to expect"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Which areas are affected"
            },
            {
              "id": "extent",
              "label": "How visible it is"
            },
            {
              "id": "sidedness",
              "label": "Whether it is worse on one side"
            },
            {
              "id": "trajectory",
              "label": "How it has changed since treatment"
            },
            {
              "id": "function_effect",
              "label": "Whether it affects eating, breathing or vision"
            },
            {
              "id": "expectations",
              "label": "What the family was told to expect"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Symptoms"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            }
          ]
        },
        {
          "id": "adverse.numbness_sensation",
          "label": "Numbness, tingling or itching",
          "description": "Numb, tingly, itchy or strange feelings in the face or treated area; whether the child mentions it or touches or picks at the area.",
          "severity_signals": {
            "none": "normal sensation",
            "mild": "small numb patch rarely mentioned",
            "moderate": "noticeable numbness or itching that bothers the child daily",
            "severe": "widespread or painful altered sensation affecting eating or comfort"
          },
          "drill_down": [
            "Location and extent",
            "Whether it is changing over time",
            "Whether it affects eating or drinking"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Where the odd feeling is"
            },
            {
              "id": "extent",
              "label": "How large an area"
            },
            {
              "id": "quality",
              "label": "Numb, tingly, itchy or oversensitive"
            },
            {
              "id": "trajectory",
              "label": "Whether it is changing over time"
            },
            {
              "id": "daily_effect",
              "label": "Whether it affects eating or drinking"
            },
            {
              "id": "touching",
              "label": "Whether the child touches, rubs or picks at the area"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            }
          ]
        },
        {
          "id": "adverse.scarring",
          "label": "Scars",
          "description": "How the child and guardian feel about the child's scars (for example a cleft lip scar or surgical scars): visibility, colour, texture, and whether other children notice or ask.",
          "severity_signals": {
            "none": "scars not noticeable or not a concern",
            "mild": "notices the scar but it does not bother them much",
            "moderate": "scar is visible and bothers the child; some hiding; other children ask",
            "severe": "scar dominates how the child sees their face; significant upset or avoidance"
          },
          "drill_down": [
            "Which scars and where",
            "Colour, texture or raised areas",
            "Whether other children ask about the scar",
            "Whether the child wants to hide it",
            "Scar care being used"
          ],
          "facets": [
            {
              "id": "location",
              "label": "Which scars and where"
            },
            {
              "id": "visibility",
              "label": "How noticeable they are"
            },
            {
              "id": "colour",
              "label": "Colour: red, dark or pale"
            },
            {
              "id": "texture",
              "label": "Raised, indented, tight or itchy"
            },
            {
              "id": "maturity",
              "label": "Whether they are still settling"
            },
            {
              "id": "others_ask",
              "label": "Whether other children ask about the scar"
            },
            {
              "id": "concealment",
              "label": "Whether the child wants to hide it, and scar care being used"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Cleft Lip Scar"
            },
            {
              "instrument": "face-q-skin-cancer",
              "scale": "Appraisal of Scars"
            }
          ]
        },
        {
          "id": "adverse.asymmetry",
          "label": "Unevenness or asymmetry",
          "description": "Whether the child or guardian sees one side of the face or a feature as different from the other, and how much this bothers the child.",
          "severity_signals": {
            "none": "no asymmetry that concerns them",
            "mild": "slight unevenness only the family notices",
            "moderate": "unevenness seen in most photos; other children may notice",
            "severe": "asymmetry is highly visible to the child; strong upset or avoidance"
          },
          "drill_down": [
            "Which feature or side",
            "Whether it is worse when smiling or talking",
            "Whether it has changed with growth or treatment"
          ],
          "facets": [
            {
              "id": "feature",
              "label": "Which feature looks uneven"
            },
            {
              "id": "side",
              "label": "Which side, and how different it looks"
            },
            {
              "id": "rest_vs_movement",
              "label": "Whether it shows more when smiling or talking"
            },
            {
              "id": "others_notice",
              "label": "Whether other children notice"
            },
            {
              "id": "trajectory",
              "label": "Whether it has changed with growth or treatment"
            },
            {
              "id": "bother",
              "label": "How much it bothers the child"
            }
          ],
          "priority": "standard",
          "source_refs": [
            {
              "instrument": "face-q-craniofacial",
              "scale": "Appearance: Face"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Adverse Effects: Face Overall"
            }
          ]
        }
      ]
    },
    {
      "id": "recovery",
      "label": "Recovery and early life impact",
      "weight": 0.6,
      "constructs": [
        {
          "id": "recovery.daily_activities",
          "label": "Getting back to school, play and normal routines",
          "description": "In the weeks after treatment: whether the child is back to school, play, sport, normal eating and sleep; how much help they need; and how the family is managing care and time off.",
          "severity_signals": {
            "none": "back to normal routines",
            "mild": "minor limits (e.g., no contact sport yet)",
            "moderate": "missing school or regular activities; needs help with some tasks; family routines disrupted",
            "severe": "largely at home or dependent on carers; recovery much harder than the family expected"
          },
          "drill_down": [
            "Days of school missed",
            "Whether they can play and sleep as usual",
            "How the family is coping with care and time off",
            "Whether recovery matches what the family was told"
          ],
          "facets": [
            {
              "id": "school_return",
              "label": "Getting back to school and how many days were missed"
            },
            {
              "id": "play_sport",
              "label": "Play, sport and normal activity"
            },
            {
              "id": "eating",
              "label": "Back to normal eating and drinking"
            },
            {
              "id": "sleep",
              "label": "Sleep and energy"
            },
            {
              "id": "help_needed",
              "label": "How much help the child needs with care"
            },
            {
              "id": "family_coping",
              "label": "How the family is managing care and time off"
            },
            {
              "id": "expectations",
              "label": "Whether recovery matches what the family was told"
            }
          ],
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Recovery Early Life Impact"
            },
            {
              "instrument": "face-q-craniofacial",
              "scale": "School Function"
            }
          ]
        }
      ]
    },
    {
      "id": "outcome",
      "label": "Satisfaction with outcome, decision and information",
      "weight": 1.0,
      "constructs": [
        {
          "id": "outcome.result",
          "label": "Satisfaction with the result",
          "description": "After treatment: whether the child and guardian are pleased with the result, whether it looks the way they hoped and natural, and whether they feel it was worth it.",
          "severity_signals": {
            "none": "pleased; result met or exceeded hopes",
            "mild": "mostly pleased with a small reservation",
            "moderate": "mixed; clear disappointment in one or more aspects",
            "severe": "regret, or the child or guardian feel things are worse than before"
          },
          "drill_down": [
            "What the child says about the change",
            "Whether the guardian's hopes were met",
            "Which aspect disappoints, if any",
            "Whether their view is shifting as healing progresses"
          ],
          "facets": [
            {
              "id": "expectation_vs_result",
              "label": "What the family hoped for versus what they see"
            },
            {
              "id": "child_view",
              "label": "What the child says about the change"
            },
            {
              "id": "naturalness",
              "label": "Whether it looks natural and still like them"
            },
            {
              "id": "specific_aspect",
              "label": "Which aspect, if any, disappoints"
            },
            {
              "id": "others_reaction",
              "label": "What other children or family have said"
            },
            {
              "id": "worth_it",
              "label": "Whether it feels worth what it took"
            },
            {
              "id": "view_shift",
              "label": "Whether their view is shifting as healing progresses"
            }
          ],
          "priority": "core",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Outcome"
            },
            {
              "instrument": "face-q-aesthetics",
              "scale": "Expectations"
            }
          ]
        },
        {
          "id": "outcome.decision",
          "label": "Satisfaction with the decision to have treatment",
          "description": "Whether the guardian (and child, where old enough) feel the decision to have treatment, and its timing, was right for the child and made with enough information and time.",
          "severity_signals": {
            "none": "confident the decision and timing were right",
            "mild": "small doubts but glad overall",
            "moderate": "meaningful second thoughts about the decision or its timing",
            "severe": "regrets the decision or felt pressured"
          },
          "drill_down": [
            "What influenced the decision",
            "Whether the child was involved and how they felt about it",
            "Whether they felt rushed or pressured"
          ],
          "facets": [
            {
              "id": "influences",
              "label": "What influenced the decision"
            },
            {
              "id": "timing",
              "label": "Whether the timing felt right for the child"
            },
            {
              "id": "child_involvement",
              "label": "Whether the child was involved and how they felt about it"
            },
            {
              "id": "pressure",
              "label": "Whether they felt rushed or pressured"
            },
            {
              "id": "regret",
              "label": "Any regret, and what about"
            },
            {
              "id": "advise_others",
              "label": "Whether they would advise another family to do it"
            }
          ],
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Decision"
            }
          ]
        },
        {
          "id": "outcome.information",
          "label": "Satisfaction with information received",
          "description": "Whether the family felt well informed before and after treatment about what to expect, recovery, risks and care at home, and whether the child had things explained at their level.",
          "severity_signals": {
            "none": "felt fully informed",
            "mild": "a few things they wish they had been told",
            "moderate": "important gaps; surprised by parts of recovery or result",
            "severe": "felt uninformed or misled; major unexpected consequences"
          },
          "drill_down": [
            "What the family wishes they had known",
            "Whether the child had things explained at their level",
            "Questions they still have for the team"
          ],
          "facets": [
            {
              "id": "before",
              "label": "What the family was told to expect beforehand"
            },
            {
              "id": "recovery_info",
              "label": "Information about recovery and timescales"
            },
            {
              "id": "risks",
              "label": "How risks and possible complications were explained"
            },
            {
              "id": "home_care",
              "label": "How to care for the child at home"
            },
            {
              "id": "child_level",
              "label": "Whether the child had things explained at their level"
            },
            {
              "id": "gaps",
              "label": "What they wish they had known, and questions still open"
            }
          ],
          "priority": "standard",
          "applicable_timepoints": [
            "post-op-2w",
            "post-op-6w",
            "post-op-6m",
            "post-op-12m",
            "follow-up"
          ],
          "source_refs": [
            {
              "instrument": "face-q-aesthetics",
              "scale": "Satisfaction with Information"
            }
          ]
        }
      ]
    }
  ],
  "triage": [
    {
      "id": "overall",
      "intent": "How the child feels about their face right now; if the guardian is answering, what the child says and shows about it",
      "maps_to": [
        "appearance.overall"
      ]
    },
    {
      "id": "features",
      "intent": "Which part of their face is most on their mind (let the child or guardian name it rather than offering a list)",
      "maps_to": [
        "appearance.*"
      ]
    },
    {
      "id": "function",
      "intent": "Whether anything about the face makes everyday things harder: breathing, eating, being understood when they talk, moving the face",
      "maps_to": [
        "function.*"
      ]
    },
    {
      "id": "impact",
      "intent": "How it affects school, friends and play: joining in, teasing or questions from other children, and how the child feels about themselves",
      "maps_to": [
        "psych.*",
        "social.*",
        "distress.*"
      ]
    },
    {
      "id": "recovery",
      "intent": "How recovery is going: pain, swelling, numbness, scars, and getting back to school and play",
      "maps_to": [
        "adverse.*",
        "recovery.*"
      ],
      "timepoints": [
        "post-op-2w",
        "post-op-6w",
        "post-op-6m",
        "post-op-12m",
        "follow-up"
      ]
    }
  ],
  "coverage_rules": {
    "min_confidence_to_count": 0.6,
    "drill_down_threshold": "moderate",
    "core_constructs_required": true,
    "max_constructs_per_session": 18,
    "focus_facet_threshold": 0.7
  }
}$seed$::jsonb,
  'approved',
  null,
  now()
)
on conflict (slug, version) do update set
  population = excluded.population,
  source_instrument_ids = excluded.source_instrument_ids,
  map = excluded.map,
  status = 'approved',
  approved_at = coalesce(public.construct_maps.approved_at, now());

commit;
