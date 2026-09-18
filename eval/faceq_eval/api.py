"""httpx client for the edge functions and the two REST reads the harness needs.

Everything the runner needs is expressed through the `FaceQApi` protocol so the
runner can be tested against a fake with no network.
"""

from __future__ import annotations

from typing import Any, Iterator, Protocol

import httpx

from faceq_eval.config import EvalConfig
from faceq_eval.models import SSEEvent, SessionState, StartSessionResponse
from faceq_eval.sse import SSEParser


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.status = status
        self.retryable = retryable


class FaceQApi(Protocol):
    def sign_in(self) -> str: ...
    def fetch_construct_map(self, slug: str) -> dict[str, Any] | None: ...
    def start_session(self, body: dict[str, Any]) -> StartSessionResponse: ...
    def session_state(self, resume_token: str) -> SessionState: ...
    def consent(self, resume_token: str, consent_variant: str) -> SessionState: ...
    def chat_turn(
        self, session_id: str, resume_token: str, text: str | None, input_mode: str | None
    ) -> Iterator[SSEEvent]: ...
    def end_session(self, resume_token: str) -> dict[str, Any]: ...
    def confirm_summary(self, resume_token: str, corrections: list[dict[str, Any]]) -> dict[str, Any]: ...
    def get_profile(self, session_id: str) -> dict[str, Any] | None: ...
    def get_session_row(self, session_id: str) -> dict[str, Any] | None: ...


def _error_from_response(resp: httpx.Response) -> ApiError:
    retryable = resp.status_code >= 500 or resp.status_code == 429
    message = f"HTTP {resp.status_code} from {resp.request.url.path}"
    try:
        body = resp.json()
        err = body.get("error") if isinstance(body, dict) else None
        if isinstance(err, dict):
            message = f"{message}: {err.get('code', '')} {err.get('message', '')}".strip()
            retryable = bool(err.get("retryable", retryable))
        elif isinstance(body, dict) and body.get("message"):
            message = f"{message}: {body['message']}"
    except ValueError:
        pass
    return ApiError(message, status=resp.status_code, retryable=retryable)


class HttpFaceQApi:
    def __init__(self, config: EvalConfig, client: httpx.Client | None = None) -> None:
        self.config = config
        self.client = client or httpx.Client(timeout=httpx.Timeout(config.request_timeout_s, connect=15.0))
        self._jwt: str | None = None

    # ----------------------------------------------------------------- auth / db

    def sign_in(self) -> str:
        if self._jwt:
            return self._jwt
        resp = self.client.post(
            f"{self.config.supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": self.config.supabase_anon_key, "Content-Type": "application/json"},
            json={"email": self.config.clinician_email, "password": self.config.clinician_password},
        )
        if resp.status_code != 200:
            raise ApiError(f"clinician sign-in failed: HTTP {resp.status_code} {resp.text[:200]}", status=resp.status_code)
        token = resp.json().get("access_token")
        if not token:
            raise ApiError("clinician sign-in returned no access_token")
        self._jwt = token
        return token

    def _rest_headers(self) -> dict[str, str]:
        return {
            "apikey": self.config.supabase_anon_key,
            "Authorization": f"Bearer {self.sign_in()}",
            "Accept": "application/json",
        }

    def _rest_get(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        resp = self.client.get(f"{self.config.supabase_url}/rest/v1/{table}", params=params, headers=self._rest_headers())
        if resp.status_code != 200:
            raise _error_from_response(resp)
        data = resp.json()
        return data if isinstance(data, list) else []

    def fetch_construct_map(self, slug: str) -> dict[str, Any] | None:
        rows = self._rest_get(
            "construct_maps",
            {"slug": f"eq.{slug}", "status": "eq.approved", "order": "version.desc", "limit": "1", "select": "*"},
        )
        return rows[0] if rows else None

    def get_profile(self, session_id: str) -> dict[str, Any] | None:
        rows = self._rest_get("session_profiles", {"session_id": f"eq.{session_id}", "select": "*"})
        return rows[0] if rows else None

    # `phase` / `focus_constructs` are v1.1 §D columns; fall back to the v1 column
    # list so a run against an engine that has not migrated yet still scores.
    SESSION_SELECT = (
        "id,status,language,input_tokens,output_tokens,cost_usd_estimate,model_id,prompt_version,"
        "max_turns,started_at,ended_at,phase,focus_constructs"
    )
    SESSION_SELECT_V1 = (
        "id,status,language,input_tokens,output_tokens,cost_usd_estimate,model_id,prompt_version,"
        "max_turns,started_at,ended_at"
    )

    def get_session_row(self, session_id: str) -> dict[str, Any] | None:
        try:
            rows = self._rest_get("sessions", {"id": f"eq.{session_id}", "select": self.SESSION_SELECT})
        except ApiError as exc:
            if exc.status != 400:
                raise
            rows = self._rest_get("sessions", {"id": f"eq.{session_id}", "select": self.SESSION_SELECT_V1})
        return rows[0] if rows else None

    # ----------------------------------------------------------------- functions

    def _fn_headers(self, *, clinician: bool = False) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "apikey": self.config.supabase_anon_key}
        headers["Authorization"] = f"Bearer {self.sign_in() if clinician else self.config.supabase_anon_key}"
        return headers

    def _post_json(self, fn: str, body: dict[str, Any], *, clinician: bool = False) -> dict[str, Any]:
        resp = self.client.post(f"{self.config.functions_url}/{fn}", json=body, headers=self._fn_headers(clinician=clinician))
        if resp.status_code >= 400:
            raise _error_from_response(resp)
        data = resp.json()
        if isinstance(data, dict) and "error" in data and isinstance(data["error"], dict):
            err = data["error"]
            raise ApiError(f"{fn}: {err.get('code')} {err.get('message')}", retryable=bool(err.get("retryable")))
        return data

    def start_session(self, body: dict[str, Any]) -> StartSessionResponse:
        return StartSessionResponse.model_validate(self._post_json("start-session", body, clinician=True))

    def session_state(self, resume_token: str) -> SessionState:
        return SessionState.model_validate(self._post_json("session-state", {"resume_token": resume_token}))

    def consent(self, resume_token: str, consent_variant: str) -> SessionState:
        data = self._post_json(
            "session-state", {"resume_token": resume_token, "action": "consent", "consent_variant": consent_variant}
        )
        return SessionState.model_validate(data)

    def chat_turn(
        self, session_id: str, resume_token: str, text: str | None, input_mode: str | None
    ) -> Iterator[SSEEvent]:
        body = {"session_id": session_id, "resume_token": resume_token, "text": text, "input_mode": input_mode}
        headers = self._fn_headers()
        headers["Accept"] = "text/event-stream"
        with self.client.stream("POST", f"{self.config.functions_url}/chat-turn", json=body, headers=headers) as resp:
            if resp.status_code >= 400:
                resp.read()
                raise _error_from_response(resp)
            parser = SSEParser()
            for chunk in resp.iter_bytes():
                yield from parser.feed(chunk)
            yield from parser.close()

    def end_session(self, resume_token: str) -> dict[str, Any]:
        return self._post_json("end-session", {"resume_token": resume_token})

    def confirm_summary(self, resume_token: str, corrections: list[dict[str, Any]]) -> dict[str, Any]:
        return self._post_json(
            "confirm-summary", {"resume_token": resume_token, "corrections": corrections, "confirmed": True}
        )
