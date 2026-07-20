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
MAINTAINER_USERNAME = "glm-maintainer"
MAINTAINER_MENTION_RE = re.compile(r"@glm-maintainer\b", re.IGNORECASE)

UI_KEYWORDS = (
    "ui", "ux", "css", "html", "frontend", "front-end", "react", "vue", "next.js", "nextjs",
    "streamlit", "gradio", "space", "アプリ", "画面", "デザイン", "レイアウト", "テーマ",
    "レスポンシブ", "モバイル", "スクショ", "screenshot", "viewport", "accessibility", "a11y",
)


def mentioned_agent(body: str) -> AgentProfile | None:
    matches = {match.lower() for match in MENTION_RE.findall(body)}
    if len(matches) != 1:
        return None
    return BY_USERNAME[next(iter(matches))]


def mention_instruction(body: str, profile: AgentProfile) -> str:
    return re.sub(rf"@{re.escape(profile.username)}\b", "", body, count=1, flags=re.IGNORECASE).strip()


def mentions_maintainer(body: str) -> bool:
    return bool(MAINTAINER_MENTION_RE.search(body))


def maintainer_instruction(body: str) -> str:
    return MAINTAINER_MENTION_RE.sub("", body, count=1).strip()


def is_ui_task(title: str, body: str, profile: AgentProfile) -> bool:
    if profile.key == "designer":
        return True
    text = f"{title}\n{body}".lower()
    return any(keyword in text for keyword in UI_KEYWORDS)


def delegation_comment(profile: AgentProfile, instruction: str, *, follow_up: bool) -> str:
    summary = " ".join(instruction.split())[:600] or profile.focus
    context = "追加指示" if follow_up else "新しいIssue"
    return (
        f"🧭 {context}を分類しました。\n\n"
        f"@{profile.username} 次の作業を担当してください。\n\n"
        f"> {summary}\n\n"
        f"担当領域: **{profile.display_name}** — {profile.focus}\n\n"
        "進捗と完了結果は、担当アカウント自身がリアクションとコメントで更新します。"
    )


def choose_agent(title: str, body: str) -> AgentProfile:
    text = f"{title}\n{body}".lower()
    if any(word in text for word in ("readme", "ドキュメント", "documentation", "vitepress", "docs/")):
        return AGENTS["docs"]
    if any(word in text for word in ("デザイン", "レイアウト", "ui", "ux", "css", "テーマ", "スクショ", "responsive")):
        return AGENTS["designer"]
    return AGENTS["coding"]


def assign_agent(title: str, body: str) -> AgentProfile:
    """The maintainer owns routing; user-authored specialist mentions never override it."""
    return choose_agent(title, body)
