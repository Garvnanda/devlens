"""
Phase 14: Open-Source Contest & Opportunity Radar.

No scraper: programs live in app/data/contests_seed.json as recurring month-day windows, and the
next occurrence is computed per request, so deadlines roll forward every year without a job.
ponytail: exact dates drift year to year — add a scheduled refresh only if the seed provably lags.
"""

import json
import logging
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from app.services.bedrock_client import embed_texts
from app.services.similarity import blend_rank, cosine_similarity

logger = logging.getLogger(__name__)

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "contests_seed.json"
_embedding_cache: dict[str, list[float]] = {}


@lru_cache()
def load_seed() -> dict:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def _md(year: int, md: str) -> date:
    month, day = (int(x) for x in md.split("-"))
    return date(year, month, day)


def next_window(windows: list[dict], today: date) -> dict:
    """Nearest window that has not ended yet: open now, or the soonest upcoming one."""
    candidates = []
    for w in windows:
        for year in (today.year - 1, today.year, today.year + 1):
            start = _md(year, w["start"])
            end = _md(year, w["end"])
            if end < start:  # wraps into the next year (e.g. Dec → Jan)
                end = _md(year + 1, w["end"])
            if end >= today:
                candidates.append((start, end, w["label"]))
    start, end, label = min(candidates, key=lambda c: (c[0] > today, c[0]))
    is_open = start <= today <= end
    return {
        "label": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "status": "open" if is_open else "upcoming",
        "days_left": (end - today).days if is_open else None,
        "days_until": None if is_open else (start - today).days,
    }


async def recommend_contests(fingerprint_vector: list[float] | None, today: date | None = None) -> dict:
    today = today or date.today()
    seed = load_seed()
    programs = []
    for p in seed["programs"]:
        programs.append({**{k: v for k, v in p.items() if k != "windows"}, "next_window": next_window(p["windows"], today)})

    # Soonest first: open programs by days left, then upcoming by days until.
    programs.sort(key=lambda p: (p["next_window"]["status"] != "open", p["next_window"]["days_left"] or p["next_window"]["days_until"] or 0))

    personalized = False
    if fingerprint_vector:
        missing = [p for p in programs if p["id"] not in _embedding_cache]
        if missing:
            try:
                texts = [f"{p['name']}. {p['eligibility']} Focus: {', '.join(p['focus'])}" for p in missing]
                for p, vec in zip(missing, await embed_texts(texts)):
                    _embedding_cache[p["id"]] = vec
            except Exception as exc:
                logger.warning("Contest embeddings failed, returning deadline order: %r", exc)
        if all(p["id"] in _embedding_cache for p in programs):
            sims = [cosine_similarity(fingerprint_vector, _embedding_cache[p["id"]]) for p in programs]
            base = [1 - i / len(programs) for i in range(len(programs))]
            for p, score, sim in zip(programs, blend_rank(base, sims, weight=0.6), sims):
                p["score"] = round(score, 4)
                p["fingerprint_match"] = round(sim, 4)
            programs.sort(key=lambda p: p["score"], reverse=True)
            personalized = True

    return {"last_reviewed": seed["last_reviewed"], "personalized": personalized, "programs": programs}


if __name__ == "__main__":
    oct_window = [{"label": "Oct", "start": "10-01", "end": "10-31"}]
    assert next_window(oct_window, date(2026, 9, 13))["status"] == "upcoming"
    assert next_window(oct_window, date(2026, 10, 5))["days_left"] == 26
    assert next_window(oct_window, date(2026, 11, 2))["start"] == "2027-10-01"
    wrap = [{"label": "Dec-Jan", "start": "12-01", "end": "01-10"}]
    assert next_window(wrap, date(2027, 1, 5))["status"] == "open", next_window(wrap, date(2027, 1, 5))
    multi = [{"label": "A", "start": "01-15", "end": "02-15"}, {"label": "B", "start": "07-15", "end": "08-15"}]
    assert next_window(multi, date(2026, 3, 1))["label"] == "B"
    assert all(len(p["windows"]) for p in load_seed()["programs"])
    print("contest_service self-check passed")
