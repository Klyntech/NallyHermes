from app.crawler import PageParser, canonical_url, domain_allowed, normalize_url


def test_normalize_url_removes_fragment_and_rejects_bad_schemes():
    assert normalize_url("https://example.com/path#section") == "https://example.com/path"
    assert normalize_url("file:///etc/passwd") is None


def test_normalize_url_rejects_credentials_and_nonstandard_ports():
    assert normalize_url("https://user:pass@example.com/") is None
    assert normalize_url("https://example.com:8443/") is None


def test_page_parser_collects_title_links_headings_metadata_and_tables():
    parser = PageParser()
    parser.feed(
        '<html><head><title>Example page</title><meta name="author" content="Ada"></head>'
        '<body><h1>Overview</h1><table><tr><th>Name</th><td>Value</td></tr></table>'
        '<a href="/about">About</a></body></html>'
    )
    assert " ".join(parser.title_parts) == "Example page"
    assert parser.links == ["/about"]
    assert parser.headings == ["Overview"]
    assert parser.meta["author"] == "Ada"
    assert parser.tables == ["Name | Value"]


def test_canonical_url_deduplicates_trailing_slashes_and_fragments():
    assert canonical_url("https://EXAMPLE.com/docs/#intro") == "https://example.com/docs"


def test_domain_controls_match_subdomains_and_exclusions():
    assert domain_allowed("https://docs.example.com/a", ["example.com"], [])
    assert not domain_allowed("https://docs.example.com/a", ["other.com"], [])
    assert not domain_allowed("https://docs.example.com/a", [], ["example.com"])
