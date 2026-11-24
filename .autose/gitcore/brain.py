"""Brain adapter: the only module that talks to a model (ADR-006).

BRAIN=gemini -> Google Gemini API, OpenAI-compatible endpoint, key from GEMINI_API_KEY
BRAIN=llm    -> OpenRouter (OpenAI-compatible), key from OPENROUTER_API_KEY
BRAIN=slm    -> any OpenAI-compatible local server, e.g. Ollama (OLLAMA_BASE_URL)
BRAIN=fake   -> scripted replies from GITCORE_FAKE_SCRIPT (JSON file), for harness tests

Provider per role: BRAIN_<ROLE> (e.g. BRAIN_REVIEW=llm), falling back to BRAIN.
Model per role: MODEL_<ROLE> (e.g. MODEL_REVIEW), falling back to MODEL_BUILDER.
Cost: taken from the provider when it reports it (OpenRouter); otherwise computed
from GITCORE_PRICE_IN / GITCORE_PRICE_OUT (USD per million tokens).
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


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# HTTP errors worth retrying. Everything else (400 bad request, 401/403 auth,
# 402 out of credits, 404 unknown model) fails at once instead of burning retries.
RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


def kind_for(role: str) -> str:
    return (os.environ.get(f"BRAIN_{role.upper()}") or os.environ.get("BRAIN") or "gemini").lower()


def model_for(role: str) -> str:
    return os.environ.get(f"MODEL_{role.upper()}") or os.environ.get("MODEL_BUILDER") or "gemini-2.5-flash"


def _price(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


class Brain:
    def __init__(self, usage: Usage | None = None):
        self.kind = os.environ.get("BRAIN", "gemini").lower()   # default provider; roles may override
        self.usage = usage or Usage()
        self._clients: dict[str, object] = {}
        self._script: dict[str, list] | None = None

    # ---------------------------------------------------------------- public
    def chat(self, role: str, messages: list[dict], temperature: float | None = None) -> str:
        self._check_budget()
        kind = kind_for(role)
        if kind == "fake":
            return self._fake(role)
        if temperature is None:
            temperature = 0.0 if role == "review" else 0.2
        client = self._get_client(kind)
        model = model_for(role)
        kwargs = dict(model=model, messages=messages, temperature=temperature,
                      max_tokens=LIMITS.max_output_tokens, timeout=LIMITS.llm_timeout_s)
        if kind == "llm":
            kwargs["extra_body"] = {"usage": {"include": True}}
        if kind == "gemini":
            # Thinking tokens count toward max_tokens and are billed as output;
            # keep them low so the JSON answer is not cut off. "" disables the parameter.
            effort = os.environ.get("GITCORE_REASONING_EFFORT", "low")
            if effort:
                kwargs["reasoning_effort"] = effort
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                resp = client.chat.completions.create(**kwargs)
                text = (resp.choices[0].message.content or "") if resp.choices else ""
                self._record(role, resp)
                return text
            except BudgetExceeded:
                raise
            except Exception as e:
                last_err = e
                status = getattr(e, "status_code", None)
                if status is not None and status not in RETRYABLE_STATUS:
                    raise RuntimeError(f"model call failed ({kind}:{model}), not retried, HTTP {status}: {e}") from e
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"model call failed after 3 attempts ({kind}:{model}): {last_err}")

    # --------------------------------------------------------------- private
    def _get_client(self, kind: str):
        if kind not in self._clients:
            from openai import OpenAI
            if kind == "slm":
                client = OpenAI(base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
                                api_key=os.environ.get("OLLAMA_API_KEY", "ollama"))
            elif kind == "gemini":
                key = os.environ.get("GEMINI_API_KEY")
                if not key:
                    raise RuntimeError("GEMINI_API_KEY is not set")
                client = OpenAI(base_url=GEMINI_BASE_URL, api_key=key)
            elif kind == "llm":
                key = os.environ.get("OPENROUTER_API_KEY")
                if not key:
                    raise RuntimeError("OPENROUTER_API_KEY is not set")
                client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=key)
            else:
                raise RuntimeError(f"unknown BRAIN kind '{kind}' (use gemini, llm, slm or fake)")
            self._clients[kind] = client
        return self._clients[kind]

    def _record(self, role: str, resp) -> None:
        u = getattr(resp, "usage", None)
        p = getattr(u, "prompt_tokens", 0) or 0
        c = getattr(u, "completion_tokens", 0) or 0
        total = getattr(u, "total_tokens", 0) or 0
        # Some providers report thinking tokens only in total_tokens; they are billed as output.
        hidden = max(0, total - p - c)
        c += hidden
        cost = None
        if u is not None:
            cost = getattr(u, "cost", None)
            if cost is None and getattr(u, "model_extra", None):
                cost = u.model_extra.get("cost")
        if cost is None:  # Gemini direct / local: compute from configured prices
            r = role.upper()
            pin = _price(f"GITCORE_PRICE_IN_{r}", _price("GITCORE_PRICE_IN", 1.50))
            pout = _price(f"GITCORE_PRICE_OUT_{r}", _price("GITCORE_PRICE_OUT", 9.00))
            cost = (p * pin + c * pout) / 1_000_000
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
