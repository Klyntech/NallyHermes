from app.main import assess_relevance


def test_relevant_text_is_marked_relevant():
    status, flags = assess_relevance(
        "how do large language models work",
        "Large language models explained",
        "Large language models learn patterns from large text datasets.",
    )
    assert status == "relevant"
    assert flags == []


def test_unrelated_title_and_text_are_flagged():
    status, flags = assess_relevance(
        "how do large language models work",
        "Daily exercise routines",
        "A guide to running, walking, and fitness training.",
    )
    assert status == "low_relevance"
    assert "low_query_overlap" in flags


def test_title_only_match_is_uncertain_not_rejected():
    status, flags = assess_relevance(
        "how do large language models work",
        "Large language models",
        "A general overview of computing systems and data.",
    )
    assert status == "uncertain"
    assert "limited_query_overlap" in flags
