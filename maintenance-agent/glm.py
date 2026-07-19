from __future__ import annotations

import json
from typing import Any

import httpx

from config import Settings


class GlmClient:
    def __init__(self, settings: Settings):
        if not settings.openwebui_api_key:
            raise RuntimeError("Open WebUI API key is not configured")
        self.model = settings.model
        self.client = httpx.Client(
            base_url=settings.openwebui_base_url,
            headers={"Authorization": f"Bearer {settings.openwebui_api_key}"},
            timeout=settings.request_timeout_seconds,
        )

    def close(self) -> None:
        self.client.close()

    def complete_json(self, system: str, prompt: str) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        content = self._completion_content(payload)
        try:
            return _parse_json(content)
        except (json.JSONDecodeError, ValueError):
            repair_payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": "Repair malformed JSON without changing its meaning. Return one valid JSON object only.",
                    },
                    {
                        "role": "user",
                        "content": "Repair this response. Preserve every path and complete file content:\n" + content,
                    },
                ],
                "stream": False,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            }
            return _parse_json(self._completion_content(repair_payload))

    def _completion_content(self, payload: dict[str, Any]) -> str:
        response = self.client.post(
            "/api/chat/completions",
            json=payload,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("choices", [{}])[0].get("message", {}).get("content", "")


def _parse_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("GLM response did not contain a JSON object")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("GLM response must be a JSON object")
    return parsed
