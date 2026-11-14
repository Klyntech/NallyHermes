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


def test_title_match_cannot_override_unrelated_passage():
    status, flags = assess_relevance(
        "how do large language models work",
        "Large language models - Wikipedia",
        "Demonstrates how to increase efficient exercise by running up and down balls.",
    )
    assert status == "low_relevance"
    assert "title_match_does_not_confirm_passage" in flags


def test_one_relevant_term_in_long_passage_is_not_enough():
    status, flags = assess_relevance(
        "how do large language models work",
        "Large language models overview",
        "Models are discussed briefly. The rest covers unrelated exercise routines and sports.",
    )
    assert status == "low_relevance"
    assert "weak_passage_overlap" in flags


def test_short_passage_is_flagged():
    status, flags = assess_relevance(
        "large language models",
        "Large language models",
        "Language models.",
    )
    assert status == "low_relevance"
    assert "short_content" in flags
