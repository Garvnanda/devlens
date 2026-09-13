"""Cosine similarity + skill-fingerprint re-ranking, shared by Phase 10 global search and Phase 14 contests."""

import math


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def blend_rank(base_order_scores: list[float], similarities: list[float], weight: float = 0.5) -> list[float]:
    """
    Mix the source's own relevance order (GitHub best-match, or deadline order) with fingerprint
    similarity. Raw embedding cosines cluster in a narrow band, so min-max normalise them first —
    otherwise the fingerprint term barely moves anything.
    """
    if not similarities:
        return base_order_scores
    lo, hi = min(similarities), max(similarities)
    span = hi - lo
    norm = [(s - lo) / span if span > 1e-9 else 0.5 for s in similarities]
    return [(1 - weight) * b + weight * n for b, n in zip(base_order_scores, norm)]


if __name__ == "__main__":
    assert abs(cosine_similarity([1, 0], [1, 0]) - 1) < 1e-9
    assert abs(cosine_similarity([1, 0], [0, 1])) < 1e-9
    assert cosine_similarity([], [1]) == 0.0
    ranked = blend_rank([1.0, 0.5, 0.0], [0.10, 0.30, 0.20])
    assert ranked[1] > ranked[2], ranked
    print("similarity self-check passed")
