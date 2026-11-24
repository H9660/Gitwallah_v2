"""ReAct-style loop with a JSON action protocol.

Plain JSON instead of provider tool-calling so the same loop works with
OpenRouter models and local SLMs (ADR-006). Each reply must be one JSON object:
  {"thought": "...", "action": "<tool>", "args": {...}}
The loop ends on action "finish" (its args are the agent's result) or when the
tool-step budget is used up.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .brain import NATIVE_CALL_NOTE, Brain, is_native_call_filter

# Said once in every system prompt: the "tools" are a text protocol, not the API's function calling.
TEXT_PROTOCOL = ("These tools are NOT native function calls and none are declared to the API. Never use "
                 "function calling. Every reply is exactly one JSON object written as plain text: "
                 '{"action": "<tool name or finish>", "args": {...}}.')
from .config import PROMPTS_DIR
from .tools import Toolbox, ToolError


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def untrusted_issue(issue: dict) -> str:
    body = (issue.get("body") or "").replace("</untrusted_issue>", "")
    title = (issue.get("title") or "").replace("</untrusted_issue>", "")
    return f"<untrusted_issue number=\"{issue.get('number')}\">\nTITLE: {title}\n\n{body}\n</untrusted_issue>"


def extract_json(text: str):
    """Return the first JSON object in `text` (tolerates fences and prose)."""
    if text is None or not text.strip():
        raise ValueError("empty reply")
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start:i + 1])
                    except json.JSONDecodeError:
                        break
        start = t.find("{", start + 1)
    raise ValueError("no JSON object found in reply")


@dataclass
class LoopResult:
    status: str                    # finished | budget_hit | error
    result: dict = field(default_factory=dict)
    steps: int = 0
    transcript: list = field(default_factory=list)
    error: str = ""


def _reply_problem(brain: Brain, e: Exception) -> tuple[str, str]:
    """(error text for the run record, corrective message for the model) for an unusable reply."""
    meta = getattr(brain, "last_reply", None) or {}
    finish, limit = meta.get("finish_reason", "?"), meta.get("max_tokens", "?")
    if finish == "length":
        return (f"reply cut off at the output limit (finish_reason=length, max_tokens={limit})",
                "ERROR: your reply was cut off at the output limit. Reply again with ONE short JSON object "
                "(keep every string brief, no code, no prose).")
    if is_native_call_filter(finish):
        return (f"model kept attempting native function calls instead of JSON text (finish_reason={finish})",
                "ERROR: " + NATIVE_CALL_NOTE)
    if str(e) == "empty reply":
        return (f"empty reply (finish_reason={finish}, max_tokens={limit})",
                "ERROR: your reply was empty. Reply now with one JSON object with 'action' and 'args'.")
    return (f"{e} (finish_reason={finish})",
            f"ERROR: your reply was not one JSON object with 'action' and 'args' ({e}). Reply again with JSON only.")


def run_agent(brain: Brain, role: str, system: str, task: str, tools: Toolbox | None, max_steps: int) -> LoopResult:
    guard = load_prompt("guard.md")
    tool_doc = tools.describe() if tools else '- finish {...}: return your result'
    messages = [
        {"role": "system", "content": f"{guard}\n\n{system}\n\n## Tools\n{TEXT_PROTOCOL}\n\n{tool_doc}"},
        {"role": "user", "content": task},
    ]
    transcript: list = []
    steps = 0
    bad_replies = 0
    while True:
        reply = brain.chat(role, messages)
        transcript.append({"role": "assistant", "content": reply, **(getattr(brain, "last_reply", None) or {})})
        messages.append({"role": "assistant", "content": reply})
        try:
            action = extract_json(reply)
            name = action.get("action")
            args = action.get("args") or {}
            if not isinstance(args, dict):
                raise ValueError("args must be an object")
        except (ValueError, AttributeError) as e:
            bad_replies += 1
            why, obs = _reply_problem(brain, e)
            if bad_replies > 2:
                return LoopResult("error", steps=steps, transcript=transcript, error=f"unparsable replies: {why}")
            messages.append({"role": "user", "content": obs})
            transcript.append({"role": "tool", "content": obs})
            continue

        if name == "finish":
            return LoopResult("finished", result=args, steps=steps, transcript=transcript)
        if tools is None:
            obs = "ERROR: you have no tools. Reply with the finish action."
        elif steps >= max_steps:
            obs = f"BUDGET: tool-step limit ({max_steps}) reached. Reply with the finish action now."
            if steps >= max_steps + 2:
                return LoopResult("budget_hit", steps=steps, transcript=transcript, error="tool-step budget used up")
        else:
            try:
                obs = tools.call(name, args)
            except ToolError as e:
                obs = f"TOOL ERROR: {e}"
            except TypeError as e:
                obs = f"TOOL ERROR: bad arguments for {name}: {e}"
        steps += 1
        messages.append({"role": "user", "content": f"OBSERVATION ({name}):\n{obs}"})
        transcript.append({"role": "tool", "content": f"{name}: {obs[:2000]}"})
        # keep the context bounded: system + task + last 16 messages
        if len(messages) > 20:
            messages = messages[:2] + [{"role": "user", "content": "(older steps omitted)"}] + messages[-16:]


def single_shot(brain: Brain, role: str, system: str, task: str, retries: int = 1) -> dict:
    """One JSON answer, no tools (Spec agent)."""
    guard = load_prompt("guard.md")
    messages = [{"role": "system", "content": f"{guard}\n\n{system}"}, {"role": "user", "content": task}]
    last = None
    for _ in range(retries + 1):
        reply = brain.chat(role, messages)
        try:
            obj = extract_json(reply)
            return obj.get("args", obj) if obj.get("action") == "finish" else obj
        except ValueError as e:
            last, obs = _reply_problem(brain, e)
            messages += [{"role": "assistant", "content": reply}, {"role": "user", "content": obs}]
    raise ValueError(f"no JSON from {role}: {last}")
