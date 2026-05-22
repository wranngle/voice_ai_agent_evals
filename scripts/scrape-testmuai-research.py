#!/usr/bin/env python3
"""Collect a focused public TestMu AI research pack.

This is intentionally not a site mirror. It captures public metadata, headings,
short evidence snippets, internal links, and screenshots for competitive
analysis of voice-agent evaluation capabilities.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "research" / "testmuai-agent-eval-scrape"
ASSET_DIR = OUT_DIR / "assets"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
SITEMAPS = [
    "https://www.testmuai.com/sitemap.xml",
    "https://www.testmuai.com/support/sitemap.xml",
]
TESTMU_HOST = "www.testmuai.com"


@dataclass(frozen=True)
class SourcePage:
    slug: str
    url: str
    reason: str
    screenshot: bool = False


PAGES = [
    SourcePage("home", "https://www.testmuai.com/", "Main positioning, IA, feature claims.", True),
    SourcePage(
        "agent-to-agent",
        "https://www.testmuai.com/agent-to-agent-testing/",
        "Direct voice/chat/calling-agent eval benchmark page.",
        True,
    ),
    SourcePage("kane-ai", "https://www.testmuai.com/kane-ai/", "Autonomous test planning/authoring model."),
    SourcePage("kane-cli", "https://www.testmuai.com/kane-cli/", "Natural-language local-browser automation and CLI flow.", True),
    SourcePage("mcp", "https://www.testmuai.com/mcp/", "MCP framing for connecting agents to test data/tools.", True),
    SourcePage(
        "test-intelligence",
        "https://www.testmuai.com/test-intelligence/",
        "Analytics, failure classification, flaky tests, and insights.",
        True,
    ),
    SourcePage("hyperexecute", "https://www.testmuai.com/hyperexecute/", "Distributed orchestration and execution cloud.", True),
    SourcePage("docs-index", "https://www.testmuai.com/support/docs/", "Documentation index and taxonomy.", True),
    SourcePage("api-index", "https://www.testmuai.com/support/api-doc/", "Public API doc taxonomy.", True),
    SourcePage(
        "ai-agent-evaluation-blog",
        "https://www.testmuai.com/blog/ai-agent-evaluation/",
        "Background article on AI-agent evaluation framing.",
    ),
    SourcePage(
        "agent-to-agent-launch-blog",
        "https://www.testmuai.com/blog/introducing-ai-agent-to-agent-testing-platform/",
        "Launch framing for agent-to-agent testing.",
    ),
    SourcePage(
        "learning-hub-ai-agents",
        "https://www.testmuai.com/learning-hub/ai-agents/",
        "Concept taxonomy for AI agents.",
    ),
    SourcePage(
        "kane-cli-agent-mode-doc",
        "https://www.testmuai.com/support/docs/kane-cli-agent-mode/",
        "CLI agent-mode mechanics.",
    ),
    SourcePage(
        "kane-cli-skills-doc",
        "https://www.testmuai.com/support/docs/kane-cli-skills/",
        "Skill/package model for reusable agent testing behavior.",
    ),
    SourcePage(
        "kane-cli-testmd-doc",
        "https://www.testmuai.com/support/docs/kane-cli-testmd/",
        "Markdown test objective format.",
    ),
    SourcePage(
        "kane-cli-cicd-doc",
        "https://www.testmuai.com/support/docs/kane-cli-cicd/",
        "CI/CD execution model.",
    ),
    SourcePage(
        "analytics-test-data-api",
        "https://www.testmuai.com/support/api-doc/analytics/test-data/get-test-execution-data-with-ai-insights/",
        "Run-result retrieval with AI insights.",
    ),
    SourcePage(
        "analytics-rca-api",
        "https://www.testmuai.com/support/api-doc/analytics/root-cause-analysis/get-ai-powered-root-cause-analysis-for-test-failures/",
        "Root-cause analysis API model.",
    ),
    SourcePage(
        "hyperexecute-job-status-api",
        "https://www.testmuai.com/support/api-doc/hyperexecute/jobs/check-the-status-of-a-job-and-its-associated-tasks/",
        "Job/task status model.",
    ),
    SourcePage(
        "hyperexecute-scenario-api",
        "https://www.testmuai.com/support/api-doc/hyperexecute/jobs/fetch-scenario-details-associated-with-your-job-id/",
        "Scenario detail API model.",
    ),
    SourcePage(
        "hyperexecute-artifacts-api",
        "https://www.testmuai.com/support/api-doc/hyperexecute/artifacts/retrieve-the-metadata-of-all-artifacts-generated-by-a-job/",
        "Artifacts metadata model.",
    ),
    SourcePage(
        "performance-summary-api",
        "https://www.testmuai.com/support/api-doc/performance-testing/performance-testing/retrieve-a-summary-of-performance-testing-results-for-a-specific-job/",
        "Performance result summary model.",
    ),
    SourcePage(
        "session-video-api",
        "https://www.testmuai.com/support/api-doc/selenium-automation-api/session/fetch-recorded-video-of-a-test-session-id/",
        "Session video artifact retrieval model.",
    ),
    SourcePage(
        "session-network-api",
        "https://www.testmuai.com/support/api-doc/selenium-automation-api/session/network-log-of-a-test-session/",
        "Session network log retrieval model.",
    ),
    SourcePage(
        "smartui-upload-api",
        "https://www.testmuai.com/support/api-doc/smart-ui/upload-screenshots/upload-any-locally-captured-images-to-smartui-for-visual-regression-testing-maximum-upload-size-100mb/",
        "External screenshot upload model.",
    ),
    SourcePage(
        "test-manager-test-runs-api",
        "https://www.testmuai.com/support/api-doc/test-manager/test-runs/create-test-run/",
        "Test-run creation model.",
    ),
    SourcePage(
        "test-manager-test-cases-api",
        "https://www.testmuai.com/support/api-doc/test-manager/test-cases/create-test-cases-by-project-id/",
        "Test-case creation model.",
    ),
]


KEY_TERMS = [
    "agent",
    "voice",
    "call",
    "caller",
    "chat",
    "metric",
    "score",
    "scenario",
    "recording",
    "upload",
    "hallucination",
    "bias",
    "toxicity",
    "compliance",
    "fcr",
    "csat",
    "containment",
    "stt",
    "dtmf",
    "noise",
    "inbound",
    "outbound",
    "cli",
    "mcp",
    "artifact",
    "root cause",
    "analytics",
    "insight",
    "hyperexecute",
    "performance",
]

SITEMAP_TERMS = [
    *KEY_TERMS,
    "kane",
    "api-doc",
    "support/docs",
    "selenium-automation-api",
    "smart-ui",
    "test-manager",
    "performance-testing",
]

BOILERPLATE_LINES = {
    "kaneai - genai-native testing agent",
    "world's first end-to-end software testing agent",
    "test ai agents such as chatbots, voicebots or both",
    "smartui - visual testing agent",
    "ai-native test intelligence insights",
    "accessibility testing agent",
    "agentic testing cloud platform",
    "scalable browser infrastructure for ai agents",
    "orchestrate and optimize testing workflows with ai agents",
    "start free testingtalk to an ai expert",
    "get real-time ai insights to improve test performance",
    "connect ai agents directly in ide through unified mcp server tools",
    "test ai agents, including chatbots, voice assistants and more",
    "root cause analysis agent",
    "analyze test data and uncover actionable ai insights",
    "kane cli - browser automation tool for testing",
    "start testing your ai agents",
}

BLOCKED_SCREENSHOT_MARKERS = [
    "performing security verification",
    "security verification",
    "cloudflare",
    "ray id",
]


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def is_boilerplate_line(line: str) -> bool:
    normalized = normalize_space(line).lower()
    return normalized in BOILERPLATE_LINES


def fetch_page(page: SourcePage) -> dict:
    response = requests.get(page.url, timeout=30, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    content_root = soup.find("main") or soup.find("article") or soup

    title = normalize_space(soup.title.get_text(" ")) if soup.title else ""
    description_tag = soup.find("meta", attrs={"name": "description"})
    description = normalize_space(description_tag.get("content", "")) if description_tag else ""
    headings = [
        normalize_space(tag.get_text(" "))
        for tag in content_root.find_all(["h1", "h2", "h3"])
        if normalize_space(tag.get_text(" "))
    ][:80]

    lines: list[str] = []
    seen: set[str] = set()
    for text_node in content_root.find_all(string=True):
        line = normalize_space(str(text_node))
        if not 25 <= len(line) <= 220:
            continue
        if is_boilerplate_line(line):
            continue
        if line.lower() in seen:
            continue
        if any(term in line.lower() for term in KEY_TERMS):
            lines.append(line)
            seen.add(line.lower())
        if len(lines) >= 30:
            break

    links = []
    seen_links = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        text = normalize_space(anchor.get_text(" "))
        if not href or href.startswith("#"):
            continue
        href = urljoin("https://www.testmuai.com", href)
        parsed_href = urlparse(href)
        if parsed_href.scheme != "https" or parsed_href.hostname != TESTMU_HOST:
            continue
        if href in seen_links:
            continue
        if any(term in (href + " " + text).lower() for term in KEY_TERMS):
            links.append({"text": text[:120], "url": href})
            seen_links.add(href)
        if len(links) >= 80:
            break

    return {
        "slug": page.slug,
        "url": response.url,
        "reason": page.reason,
        "status": response.status_code,
        "title": title,
        "description": description,
        "headings": headings,
        "evidence_lines": lines,
        "internal_links": links,
    }


def discover_sitemap_urls() -> dict:
    discovered = {
        "sitemaps": SITEMAPS,
        "matching_terms": SITEMAP_TERMS,
        "total_urls": 0,
        "matched_urls": [],
    }
    seen = set()

    for sitemap_url in SITEMAPS:
        response = requests.get(sitemap_url, timeout=30, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        root = ET.fromstring(response.content)
        namespace = ""
        if root.tag.startswith("{"):
            namespace = root.tag.split("}", 1)[0] + "}"

        for loc in root.findall(f".//{namespace}loc"):
            if not loc.text:
                continue
            url = loc.text.strip()
            discovered["total_urls"] += 1
            if url in seen:
                continue
            haystack = url.lower()
            if any(term in haystack for term in SITEMAP_TERMS):
                discovered["matched_urls"].append(url)
                seen.add(url)

    discovered["matched_count"] = len(discovered["matched_urls"])
    return discovered


def screenshot_pages(records: list[dict]) -> dict[str, str]:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    wanted = {page.slug: page for page in PAGES if page.screenshot}
    paths: dict[str, str] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path="/home/wranngle/.local/bin/google-chrome")
        context = browser.new_context(
            viewport={"width": 1440, "height": 1100},
            device_scale_factor=1,
            user_agent=USER_AGENT,
        )
        for record in records:
            if record["slug"] not in wanted:
                continue
            page = context.new_page()
            page.set_default_timeout(15_000)
            try:
                page.goto(record["url"], wait_until="domcontentloaded", timeout=45_000)
                page.wait_for_timeout(5000)
                path = ASSET_DIR / f"{record['slug']}.png"
                body_text = page.locator("body").inner_text(timeout=5000).lower()
                if any(marker in body_text for marker in BLOCKED_SCREENSHOT_MARKERS):
                    if path.exists():
                        path.unlink()
                    record["screenshot_blocked"] = "Cloudflare/security verification in headless browser"
                    continue
                page.screenshot(path=str(path), full_page=True)
                paths[record["slug"]] = str(path.relative_to(ROOT))
            finally:
                page.close()
        browser.close()
    return paths


def write_summary(records: list[dict], screenshot_paths: dict[str, str], sitemap_discovery: dict) -> None:
    captured_at = datetime.now(timezone.utc).isoformat()

    def screenshot_cell(record: dict) -> str:
        if record["slug"] in screenshot_paths:
            return screenshot_paths[record["slug"]]
        return record.get("screenshot_blocked", "")

    source_table = "\n".join(
        f"| {record['slug']} | [{record['title'] or record['url']}]({record['url']}) | {record['reason']} | "
        f"{screenshot_cell(record)} |"
        for record in records
    )

    page_findings = []
    for record in records:
        headings = "; ".join(record["headings"][:8])
        evidence = "\n".join(f"  - {line}" for line in record["evidence_lines"][:5])
        page_findings.append(
            f"### {record['slug']}\n"
            f"- URL: {record['url']}\n"
            f"- Title: {record['title']}\n"
            f"- Key headings: {headings}\n"
            f"- Short extracted evidence lines:\n{evidence if evidence else '  - No targeted evidence lines found.'}\n"
        )

    summary = f"""# TestMu AI Agent-Eval Scrape

Captured: {captured_at}

This pack is a focused public scrape for competitive analysis of TestMu AI's agent, voice-agent, orchestration, analytics, and docs surfaces. It is not a full copy of their site or docs; see `pages.json` for structured metadata and `assets/` for screenshots.

## High-Signal Product Claims For Voice-Agent Evals

- Agent-to-agent testing is explicitly positioned for testing AI agents, including chatbots, voice assistants, inbound phone agents, and outbound caller agents.
- The agent-to-agent page frames the evaluator as an autonomous AI user/evaluator that engages the system under test and scores responses.
- Claimed quality dimensions include hallucination, bias, toxicity, compliance, accuracy, safety, context awareness, completeness, response quality, and conversation flow.
- Phone-agent claims include real call testing, speaker-identified transcripts, DTMF detection, FCR, intent recognition, CSAT, containment rate, voice quality, STT accuracy, production recording upload, outbound number pools, passive monitoring, voice selection, response timing, and background noise presets.
- The product uses readiness verdict language: Green/Yellow/Red production readiness and confidence by evaluation volume.
- Kane/Kane CLI positions natural-language test authoring and local browser automation as a CLI/agent workflow.
- HyperExecute/Test Insights/API docs expose patterns worth copying: distributed job/task orchestration, artifacts, logs, run analytics, AI root-cause analysis, performance summaries, and test manager run/case APIs.

## Sitemap Discovery

- Public sitemaps checked: {", ".join(SITEMAPS)}
- Total sitemap URLs seen: {sitemap_discovery["total_urls"]}
- URLs matching agent/eval/docs/API terms: {sitemap_discovery["matched_count"]}
- Full filtered URL list: `sitemap-filtered.json`
- Browser screenshots: homepage captured successfully; several subpages returned Cloudflare/security verification in headless Chrome, so those rows are marked instead of saving misleading screenshots.

## Useful Architecture Ideas To Borrow

- Add first-class eval modes: `chat_voice`, `phone_inbound`, `phone_outbound`, `production_recording_batch`.
- Treat evaluation confidence as a function of scenario volume, sample size, recency, and pass-rate stability.
- Add a go-live readiness verdict that maps hard failures and weighted quality scores into red/yellow/green.
- Build a metrics catalog with metric owner, source, formula, confidence, thresholds, and required artifacts.
- Split phone-agent metrics into conversation quality, speech/voice quality, call-control, business outcome, safety/compliance, and integration/tool reliability.
- Store every run with artifacts: transcript, audio/video if available, tool calls, webhook logs, network traces, latency samples, evaluator rationale, and RCA.
- Add production recording upload and batch analysis as a separate workflow from synthetic simulation.
- Add evaluator persona/noise/response-timing configuration for outbound and inbound simulations.
- Add CLI-triggered eval objectives and reusable skills/modules for repeatable suites.
- Add API-style result retrieval so a dashboard or external app can consume runs, task state, artifacts, and RCA.

## Source Pages

| Slug | Source | Why Captured | Screenshot |
|---|---|---|---|
{source_table}

## Per-Page Extraction

{chr(10).join(page_findings)}
"""
    (OUT_DIR / "README.md").write_text(summary, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sitemap_discovery = discover_sitemap_urls()
    records = []
    for page in PAGES:
        try:
            records.append(fetch_page(page))
        except Exception as exc:  # noqa: BLE001 - research scrape should keep going.
            records.append({
                "slug": page.slug,
                "url": page.url,
                "reason": page.reason,
                "error": str(exc),
                "title": "",
                "description": "",
                "headings": [],
                "evidence_lines": [],
                "internal_links": [],
            })

    screenshot_paths = screenshot_pages(records)
    for record in records:
        if record["slug"] in screenshot_paths:
            record["screenshot"] = screenshot_paths[record["slug"]]

    payload = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://www.testmuai.com/",
        "sitemap_discovery": sitemap_discovery,
        "records": records,
    }
    (OUT_DIR / "pages.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (OUT_DIR / "sitemap-filtered.json").write_text(json.dumps(sitemap_discovery, indent=2), encoding="utf-8")

    all_links = []
    seen = set()
    for record in records:
        for link in record.get("internal_links", []):
            if link["url"] not in seen:
                all_links.append(link)
                seen.add(link["url"])
    (OUT_DIR / "internal-links.json").write_text(json.dumps(all_links, indent=2), encoding="utf-8")

    write_summary(records, screenshot_paths, sitemap_discovery)


if __name__ == "__main__":
    main()
