from app.main import assess_relevance


def test_title_overlap_alone_does_not_promote_unrelated_passage():
    status, flags = assess_relevance(
        "python asynchronous programming",
        "Python asynchronous programming guide",
        "A recipe for vegetable soup with carrots, onions, and herbs.",
    )
    assert status == "low_relevance"
    assert "title_only_match" in flags or "low_query_overlap" in flags


def test_relevant_passage_requires_passage_level_overlap():
    status, _ = assess_relevance(
        "python asynchronous programming",
        "Python documentation",
        "Python asynchronous programming uses async functions and await expressions.",
    )
    assert status == "relevant"
