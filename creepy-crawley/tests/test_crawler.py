from app.crawler import PageParser, normalize_url


def test_normalize_url_removes_fragment_and_rejects_bad_schemes():
    assert normalize_url("https://example.com/path#section") == "https://example.com/path"
    assert normalize_url("file:///etc/passwd") is None


def test_normalize_url_rejects_credentials_and_nonstandard_ports():
    assert normalize_url("https://user:pass@example.com/") is None
    assert normalize_url("https://example.com:8443/") is None


def test_page_parser_collects_title_and_links():
    parser = PageParser()
    parser.feed('<html><head><title>Example page</title></head><body><a href="/about">About</a></body></html>')
    assert " ".join(parser.title_parts) == "Example page"
    assert parser.links == ["/about"]
