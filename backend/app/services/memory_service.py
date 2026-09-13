"""
Phase 14: Persistent Contribution Memory + gamification (weekly streaks, badges) + portfolio.

Integration Check 4 decision: the Architect's live mission state (`architect_agent._sessions`)
stays in memory where it is. This store records the durable facts about a mission — repo, issue,
mode, when — so the dashboard can say "pick up where you left off" after a restart. A restart
still drops the live chat context; migrating `_sessions` here is a separate, deliberate change.
"""

import json
import re
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.storage.models import ContributionMemory, FingerprintSnapshot, StreakBadge, User

STATUS_RANK = {"explored": 0, "attempted": 1, "completed": 2}

# (id, name, description, predicate over stats). Earned badges are persisted and never revoked.
BADGES = [
    ("first-steps", "First Steps", "Explored your first repository", lambda s: s["repos_explored"] >= 1),
    ("explorer", "Explorer", "Explored 5 repositories", lambda s: s["repos_explored"] >= 5),
    ("mission-starter", "Mission Starter", "Planned a fix for your first issue", lambda s: s["issues_attempted"] >= 1),
    ("first-merge", "First Merge", "A pull request of yours was merged", lambda s: s["verified_prs"] >= 1),
    ("contributor", "Contributor", "5 merged pull requests verified", lambda s: s["verified_prs"] >= 5),
    ("on-a-roll", "On a Roll", "Active 4 weeks in a row", lambda s: s["longest_streak"] >= 4),
]


# ── streaks ────────────────────────────────────────────────────────────────

def next_streak(last_active: date | None, current: int, today: date) -> int:
    """Consecutive active ISO weeks. Same week keeps it, next week extends it, a gap resets to 1."""
    if last_active is None or current <= 0:
        return 1
    week = lambda d: d - timedelta(days=d.weekday())  # noqa: E731 — Monday of that week
    gap = (week(today) - week(last_active)).days // 7
    if gap <= 0:
        return current
    return current + 1 if gap == 1 else 1


def _streak_row(db: Session, user_id: int) -> StreakBadge:
    row = db.get(StreakBadge, user_id)
    if not row:
        row = StreakBadge(user_id=user_id, current_streak_days=0, longest_streak=0, badges_json="[]", last_active_date=None)
        db.add(row)
    return row


def touch_streak(db: Session, user_id: int, today: date | None = None) -> StreakBadge:
    today = today or date.today()
    row = _streak_row(db, user_id)
    row.current_streak_days = next_streak(row.last_active_date, row.current_streak_days or 0, today)
    row.longest_streak = max(row.longest_streak or 0, row.current_streak_days)
    row.last_active_date = today
    _refresh_badges(db, user_id, row)
    db.commit()
    return row


# ── stats + badges ─────────────────────────────────────────────────────────

def _stats(db: Session, user_id: int, streak: StreakBadge) -> dict:
    rows = db.query(ContributionMemory).filter(ContributionMemory.user_id == user_id).all()
    return {
        "repos_explored": len({(r.repo_owner.lower(), r.repo_name.lower()) for r in rows}),
        "issues_attempted": sum(1 for r in rows if r.issue_number is not None and r.status in ("attempted", "completed")),
        "verified_prs": sum(1 for r in rows if r.verified_at is not None),
        "current_streak": streak.current_streak_days or 0,
        "longest_streak": streak.longest_streak or 0,
    }


def _refresh_badges(db: Session, user_id: int, streak: StreakBadge) -> list[str]:
    """Adds newly earned badges; returns the ids earned just now."""
    earned = set(json.loads(streak.badges_json or "[]"))
    db.flush()
    stats = _stats(db, user_id, streak)
    new = [bid for bid, _, _, rule in BADGES if bid not in earned and rule(stats)]
    if new:
        streak.badges_json = json.dumps(sorted(earned | set(new)))
    return new


def _badge_list(streak: StreakBadge) -> list[dict]:
    earned = set(json.loads(streak.badges_json or "[]"))
    return [{"id": bid, "name": name, "description": desc, "earned": bid in earned} for bid, name, desc, _ in BADGES]


# ── activity ───────────────────────────────────────────────────────────────

def record_activity(
    db: Session,
    user_id: int,
    owner: str,
    repo: str,
    status: str = "explored",
    issue_number: int | None = None,
    title: str | None = None,
    mission_mode: str | None = None,
) -> None:
    """Upsert one memory row per (repo, issue). Status only moves forward: explored → attempted → completed."""
    q = db.query(ContributionMemory).filter(
        ContributionMemory.user_id == user_id,
        ContributionMemory.repo_owner.ilike(owner),
        ContributionMemory.repo_name.ilike(repo),
    )
    q = q.filter(ContributionMemory.issue_number.is_(None)) if issue_number is None else q.filter(ContributionMemory.issue_number == issue_number)
    row = q.first()
    if not row:
        row = ContributionMemory(user_id=user_id, repo_owner=owner, repo_name=repo, issue_number=issue_number, status=status)
        db.add(row)
    elif STATUS_RANK.get(status, 0) > STATUS_RANK.get(row.status, 0):
        row.status = status
    if title:
        row.title = title[:300]
    if mission_mode:
        row.mission_mode = mission_mode
    row.updated_at = datetime.utcnow()
    touch_streak(db, user_id)


def record_fingerprint_snapshot(db: Session, user_id: int, language_distribution: dict) -> None:
    db.add(FingerprintSnapshot(user_id=user_id, language_distribution_json=json.dumps(language_distribution)))
    db.commit()


# ── PR verification (portfolio source of truth) ────────────────────────────

_PR_URL = re.compile(r"github\.com/([\w.\-]+)/([\w.\-]+)/pull/(\d+)")
_CLOSES = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", re.I)


class VerificationError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


async def verify_pull_request(db: Session, user: User, pr_url: str, token: str | None) -> dict:
    m = _PR_URL.search(pr_url)
    if not m:
        raise VerificationError(400, "Not a pull request URL. Expected https://github.com/owner/repo/pull/123")
    owner, repo, number = m.group(1), m.group(2), int(m.group(3))

    auth = token or get_settings().github_pat
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "DevLens-Memory"}
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{number}", headers=headers)
    if resp.status_code == 404:
        raise VerificationError(404, "Pull request not found (or the repository is private).")
    resp.raise_for_status()
    pr = resp.json()

    author = (pr.get("user") or {}).get("login", "")
    if author.lower() != user.login.lower():
        raise VerificationError(403, f"That pull request was opened by @{author}, not @{user.login}. Only your own PRs go on your portfolio.")

    closes = _CLOSES.search(pr.get("body") or "")
    issue_number = int(closes.group(1)) if closes else None
    merged = bool(pr.get("merged_at"))

    q = db.query(ContributionMemory).filter(
        ContributionMemory.user_id == user.github_id,
        ContributionMemory.repo_owner.ilike(owner),
        ContributionMemory.repo_name.ilike(repo),
    )
    row = q.filter(ContributionMemory.pr_url == pr["html_url"]).first()
    if not row and issue_number is not None:
        row = q.filter(ContributionMemory.issue_number == issue_number).first()
    if not row:
        row = ContributionMemory(user_id=user.github_id, repo_owner=owner, repo_name=repo, issue_number=issue_number)
        db.add(row)

    row.pr_url = pr["html_url"]
    row.title = pr.get("title")
    row.status = "completed" if merged else "attempted"
    row.verified_at = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00")).replace(tzinfo=None) if merged else None
    row.updated_at = datetime.utcnow()

    streak = touch_streak(db, user.github_id)
    new_badges = _refresh_badges(db, user.github_id, streak)
    db.commit()
    return {
        "repo": f"{owner}/{repo}",
        "pr_url": row.pr_url,
        "title": row.title,
        "issue_number": issue_number,
        "merged": merged,
        "status": row.status,
        "message": "Verified and added to your portfolio." if merged else "Recorded. It will count on your portfolio once the PR is merged — run this again after merge.",
        "new_badges": new_badges,
    }


# ── read models ────────────────────────────────────────────────────────────

def _row_dict(r: ContributionMemory) -> dict:
    return {
        "repo": f"{r.repo_owner}/{r.repo_name}",
        "repo_url": f"https://github.com/{r.repo_owner}/{r.repo_name}",
        "issue_number": r.issue_number,
        "title": r.title,
        "status": r.status,
        "mission_mode": r.mission_mode,
        "pr_url": r.pr_url,
        "verified_at": r.verified_at.isoformat() if r.verified_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def get_dashboard(db: Session, user: User) -> dict:
    streak = _streak_row(db, user.github_id)
    rows = (
        db.query(ContributionMemory)
        .filter(ContributionMemory.user_id == user.github_id)
        .order_by(ContributionMemory.updated_at.desc())
        .all()
    )
    snaps = (
        db.query(FingerprintSnapshot)
        .filter(FingerprintSnapshot.user_id == user.github_id)
        .order_by(FingerprintSnapshot.created_at.desc())
        .limit(2)
        .all()
    )
    drift = None
    if len(snaps) == 2:
        now, before = json.loads(snaps[0].language_distribution_json), json.loads(snaps[1].language_distribution_json)
        changes = {lang: round(now.get(lang, 0) - before.get(lang, 0), 4) for lang in set(now) | set(before)}
        drift = {
            "since": snaps[1].created_at.isoformat(),
            "changes": dict(sorted(((k, v) for k, v in changes.items() if abs(v) >= 0.01), key=lambda kv: -abs(kv[1]))[:5]),
        }

    db.commit()
    return {
        "login": user.login,
        "resume": _row_dict(rows[0]) if rows else None,
        "recent": [_row_dict(r) for r in rows[:8]],
        "in_progress": [_row_dict(r) for r in rows if r.status == "attempted"][:5],
        "stats": _stats(db, user.github_id, streak),
        "badges": _badge_list(streak),
        "fingerprint_drift": drift,
    }


def get_portfolio(db: Session, username: str) -> dict | None:
    user = db.query(User).filter(User.login.ilike(username)).first()
    if not user:
        return None
    streak = _streak_row(db, user.github_id)
    verified = (
        db.query(ContributionMemory)
        .filter(ContributionMemory.user_id == user.github_id, ContributionMemory.verified_at.isnot(None))
        .order_by(ContributionMemory.verified_at.desc())
        .all()
    )
    from app.services.skill_fingerprint import deserialize

    fingerprint = deserialize(user.skill_fingerprint_json) or {}
    languages = sorted((fingerprint.get("language_distribution") or {}).items(), key=lambda kv: -kv[1])[:6]
    db.commit()
    return {
        "login": user.login,
        "avatar_url": user.avatar_url,
        "github_url": f"https://github.com/{user.login}",
        "member_since": user.created_at.date().isoformat() if user.created_at else None,
        "contributions": [_row_dict(r) for r in verified],
        "stats": _stats(db, user.github_id, streak),
        "badges": [b for b in _badge_list(streak) if b["earned"]],
        "top_languages": [{"language": k, "share": v} for k, v in languages],
    }


if __name__ == "__main__":
    mon = date(2026, 9, 7)
    assert next_streak(None, 0, mon) == 1
    assert next_streak(mon, 3, mon + timedelta(days=4)) == 3          # same week
    assert next_streak(mon, 3, mon + timedelta(days=7)) == 4          # next week
    assert next_streak(mon + timedelta(days=6), 3, mon + timedelta(days=7)) == 4  # Sunday → Monday
    assert next_streak(mon, 3, mon + timedelta(days=15)) == 1         # skipped a week
    assert _PR_URL.search("https://github.com/pallets/flask/pull/5000").groups() == ("pallets", "flask", "5000")
    assert _CLOSES.search("This fixes #42 for real").group(1) == "42"
    print("memory_service self-check passed")
