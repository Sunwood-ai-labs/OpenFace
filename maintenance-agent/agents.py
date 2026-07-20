from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentProfile:
    key: str
    username: str
    display_name: str
    emoji: str
    focus: str


AGENTS: dict[str, AgentProfile] = {
    "designer": AgentProfile(
        "designer", "designer-agent", "OpenFace Designer", "🎨",
        "UI/UX、レスポンシブ、テーマ、アクセシビリティ、スクリーンショット比較を担当する",
    ),
    "coding": AgentProfile(
        "coding", "coding-agent", "OpenFace Coding", "🛠️",
        "アプリケーション実装、リファクタリング、テスト、ビルドを担当する",
    ),
    "docs": AgentProfile(
        "docs", "docs-agent", "OpenFace Docs", "📚",
        "README、VitePress、設定例、再構築手順、リンク整合性を担当する",
    ),
    "review": AgentProfile(
        "review", "review-agent", "OpenFace Review", "🔎",
        "diff、テスト、セキュリティ、回帰、要件充足を独立にレビューし必要なら修正する",
    ),
}

BY_USERNAME = {profile.username: profile for profile in AGENTS.values()}
MENTION_RE = re.compile(r"@(designer-agent|coding-agent|docs-agent|review-agent)\b", re.IGNORECASE)


def mentioned_agent(body: str) -> AgentProfile | None:
    matches = {match.lower() for match in MENTION_RE.findall(body)}
    if len(matches) != 1:
        return None
    return BY_USERNAME[next(iter(matches))]


def mention_instruction(body: str, profile: AgentProfile) -> str:
    return re.sub(rf"@{re.escape(profile.username)}\b", "", body, count=1, flags=re.IGNORECASE).strip()


def choose_agent(title: str, body: str) -> AgentProfile:
    text = f"{title}\n{body}".lower()
    if any(word in text for word in ("readme", "ドキュメント", "documentation", "vitepress", "docs/")):
        return AGENTS["docs"]
    if any(word in text for word in ("デザイン", "レイアウト", "ui", "ux", "css", "テーマ", "スクショ", "responsive")):
        return AGENTS["designer"]
    return AGENTS["coding"]
