from app.main import domain_matches


def test_matches_exact_domain():
    assert domain_matches("example.com", ["example.com"])


def test_matches_subdomain():
    assert domain_matches("news.example.com", ["example.com"])


def test_does_not_match_suffix_spoof():
    assert not domain_matches("notexample.com", ["example.com"])


def test_domain_matching_is_case_insensitive():
    assert domain_matches("NEWS.Example.COM", ["Example.com"])
