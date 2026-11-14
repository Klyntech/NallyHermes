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


def test_lightpanda_command_is_local_and_bounded(monkeypatch):
    from app.crawler import lightpanda_command

    monkeypatch.setenv("LIGHTPANDA_BIN", "/usr/local/bin/lightpanda")
    monkeypatch.setenv("LIGHTPANDA_WAIT_MS", "9000")
    command = lightpanda_command("https://example.com/")
    assert command[0] == "/usr/local/bin/lightpanda"
    assert command[1:5] == ["fetch", "--obey-robots", "--dump", "html"]
    assert command[5:7] == ["--wait-ms", "5000"]
    assert command[-1] == "https://example.com/"
