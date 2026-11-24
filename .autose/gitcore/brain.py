"""Brain adapter: the only module that talks to a model (ADR-006).

BRAIN=llm  -> OpenRouter (OpenAI-compatible), key from OPENROUTER_API_KEY
BRAIN=slm  -> any OpenAI-compatible local server, e.g. Ollama (OLLAMA_BASE_URL)
BRAIN=fake -> scripted replies from GITCORE_FAKE_SCRIPT (JSON file), for harness tests

Model per role: MODEL_<ROLE> (e.g. MODEL_REVIEWER), falling back to MODEL_BUILDER.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field

from .config import LIMITS


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    usd: float = 0.0
    by_role: dict = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def add(self, role: str, p: int, c: int, usd: float) -> None:
        self.calls += 1
        self.prompt_tokens += p
        self.completion_tokens += c
        self.usd += usd
        r = self.by_role.setdefault(role, {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "usd": 0.0})
        r["calls"] += 1
        r["prompt_tokens"] += p
        r["completion_tokens"] += c
        r["usd"] = round(r["usd"] + usd, 6)

    def to_dict(self) -> dict:
        return {"calls": self.calls, "prompt_tokens": self.prompt_tokens, "completion_tokens": self.completion_tokens,
                "total_tokens": self.total_tokens, "usd": round(self.usd, 6), "by_role": self.by_role}

    @classmethod
    def from_dict(cls, d: dict | None) -> "Usage":
        u = cls()
        if d:
            u.calls = d.get("calls", 0)
            u.prompt_tokens = d.get("prompt_tokens", 0)
            u.completion_tokens = d.get("completion_tokens", 0)
            u.usd = d.get("usd", 0.0)
            u.by_role = d.get("by_role", {})
        return u


def model_for(role: str) -> str:
    return os.environ.get(f"MODEL_{role.upper()}") or os.environ.get("MODEL_BUILDER") or "google/gemini-2.5-flash"


class Brain:
    def __init__(self, usage: Usage | None = None):
        self.kind = os.environ.get("BRAIN", "llm").lower()
        self.usage = usage or Usage()
        self._client = None
        self._script: dict[str, list] | None = None

    # ---------------------------------------------------------------- public
    def chat(self, role: str, messages: list[dict], temperature: float | None = None) -> str:
        self._check_budget()
        if self.kind == "fake":
            return self._fake(role)
        if temperature is None:
            temperature = 0.0 if role == "review" else 0.2
        client = self._get_client()
        model = model_for(role)
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                kwargs = dict(model=model, messages=messages, temperature=temperature,
                              max_tokens=LIMITS.max_output_tokens, timeout=LIMITS.llm_timeout_s)
                if self.kind == "llm":
                    kwargs["extra_body"] = {"usage": {"include": True}}
                resp = client.chat.completions.create(**kwargs)
                text = (resp.choices[0].message.content or "") if resp.choices else ""
                self._record(role, resp)
                return text
            except BudgetExceeded:
                raise
            except Exception as e:  # network, 429, 5xx
                last_err = e
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"model call failed after 3 attempts ({model}): {last_err}")

    # --------------------------------------------------------------- private
    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            if self.kind == "slm":
                self._client = OpenAI(base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
                                      api_key=os.environ.get("OLLAMA_API_KEY", "ollama"))
            else:
                key = os.environ.get("OPENROUTER_API_KEY")
                if not key:
                    raise RuntimeError("OPENROUTER_API_KEY is not set")
                self._client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
        return self._client

    def _record(self, role: str, resp) -> None:
        u = getattr(resp, "usage", None)
        p = getattr(u, "prompt_tokens", 0) or 0
        c = getattr(u, "completion_tokens", 0) or 0
        cost = None
        if u is not None:
            cost = getattr(u, "cost", None)
            if cost is None and getattr(u, "model_extra", None):
                cost = u.model_extra.get("cost")
        if cost is None:  # local model or provider without cost reporting
            cost = (p + c) / 1_000_000 * float(os.environ.get("GITCORE_USD_PER_MTOK", "0.5"))
        self.usage.add(role, p, c, float(cost))
        self._check_budget()

    def _check_budget(self) -> None:
        if self.usage.total_tokens > LIMITS.max_run_tokens:
            raise BudgetExceeded(f"token budget used: {self.usage.total_tokens} > {LIMITS.max_run_tokens}")
        if self.usage.usd > LIMITS.max_run_usd:
            raise BudgetExceeded(f"USD budget used: {self.usage.usd:.4f} > {LIMITS.max_run_usd}")

    def _fake(self, role: str) -> str:
        if self._script is None:
            path = os.environ.get("GITCORE_FAKE_SCRIPT")
            if not path:
                raise RuntimeError("BRAIN=fake needs GITCORE_FAKE_SCRIPT")
            with open(path, encoding="utf-8") as f:
                self._script = json.load(f)
        queue = self._script.get(role) or []
        if not queue:
            raise RuntimeError(f"fake brain: no scripted reply left for role '{role}'")
        reply = queue.pop(0)
        text = reply if isinstance(reply, str) else json.dumps(reply)
        self.usage.add(role, len(json.dumps(self._script)) // 4 // 10, len(text) // 4, 0.0)
        return text
