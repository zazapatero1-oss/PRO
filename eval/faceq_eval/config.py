"""Environment configuration for the harness.

The harness only ever runs against the `dev` Supabase project (SPEC §12). A
FUNCTIONS_URL that looks like the demo project is refused unless the operator
explicitly sets EVAL_ALLOW_DEMO=1.
"""

from __future__ import annotations

import os
from typing import Mapping

from pydantic import BaseModel, Field


class ConfigError(RuntimeError):
    pass


class EvalConfig(BaseModel):
    functions_url: str
    supabase_url: str
    supabase_anon_key: str
    clinician_email: str
    clinician_password: str
    anthropic_api_key: str | None = None
    patient_model: str = "claude-sonnet-5"
    max_turns: int = 40
    construct_map_slug: str = "face-q-adult"
    pediatric_map_slug: str = "face-q-pediatric"
    request_timeout_s: float = 120.0
    allow_demo: bool = False

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "EvalConfig":
        env = os.environ if env is None else env
        missing = [
            k
            for k in (
                "FUNCTIONS_URL",
                "SUPABASE_URL",
                "SUPABASE_ANON_KEY",
                "EVAL_CLINICIAN_EMAIL",
                "EVAL_CLINICIAN_PASSWORD",
            )
            if not env.get(k)
        ]
        if missing:
            raise ConfigError(f"missing required environment variables: {', '.join(missing)}")
        cfg = cls(
            functions_url=env["FUNCTIONS_URL"].rstrip("/"),
            supabase_url=env["SUPABASE_URL"].rstrip("/"),
            supabase_anon_key=env["SUPABASE_ANON_KEY"],
            clinician_email=env["EVAL_CLINICIAN_EMAIL"],
            clinician_password=env["EVAL_CLINICIAN_PASSWORD"],
            anthropic_api_key=env.get("ANTHROPIC_API_KEY") or None,
            patient_model=env.get("EVAL_PATIENT_MODEL") or "claude-sonnet-5",
            max_turns=int(env.get("EVAL_MAX_TURNS") or 40),
            construct_map_slug=env.get("EVAL_CONSTRUCT_MAP_SLUG") or "face-q-adult",
            pediatric_map_slug=env.get("EVAL_PEDIATRIC_MAP_SLUG") or "face-q-pediatric",
            allow_demo=env.get("EVAL_ALLOW_DEMO") == "1",
        )
        cfg.assert_not_demo()
        return cfg

    def assert_not_demo(self) -> None:
        if self.allow_demo:
            return
        for url in (self.functions_url, self.supabase_url):
            if "demo" in url.lower():
                raise ConfigError(
                    f"refusing to run against what looks like the demo project ({url}); "
                    "SPEC §12 forbids this. Set EVAL_ALLOW_DEMO=1 only if you are sure."
                )


class RunOptions(BaseModel):
    personas: list[str] | None = None
    parallel: int = Field(default=1, ge=1)
    max_turns: int | None = None
    retry_delay_s: float = 2.0
