#!/usr/bin/env python3
"""Audit a private Hey Nally dataset manifest before model training.

Uses only the Python standard library. Audio contents are never uploaded or copied.
Manifest columns: path,label,split,speaker_id,notes
Labels: positive|negative. Splits: train|validation|false_accept_eval.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import wave
from collections import defaultdict
from pathlib import Path

EXPECTED_RATE = 16_000
EXPECTED_CHANNELS = 1
EXPECTED_WIDTH = 2
SPLITS = {"train", "validation", "false_accept_eval"}
LABELS = {"positive", "negative"}


def inspect_wave(path: Path) -> tuple[int, int, int, float]:
    with wave.open(str(path), "rb") as audio:
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        rate = audio.getframerate()
        frames = audio.getnframes()
        compression = audio.getcomptype()
        if compression != "NONE":
            raise ValueError(f"compressed WAV encoding {compression!r} is unsupported")
        if channels != EXPECTED_CHANNELS or width != EXPECTED_WIDTH or rate != EXPECTED_RATE:
            raise ValueError(f"expected mono 16-bit PCM at 16000 Hz; got channels={channels}, sample_width={width}, rate={rate}")
        return channels, width, rate, frames / rate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).parent / "data", help="private data root (default: ./data)")
    parser.add_argument("--manifest", type=Path, default=None, help="CSV manifest (default: ROOT/manifest.csv)")
    parser.add_argument("--min-positive-train", type=int, default=20_000, help="minimum synthetic/real positive training clips recommended by upstream config")
    parser.add_argument("--min-positive-validation", type=int, default=2_000)
    parser.add_argument("--min-negative-eval-hours", type=float, default=11.0, help="minimum continuous negative evaluation audio; more is better")
    parser.add_argument("--allow-incomplete", action="store_true", help="report missing data without failing; never indicates training readiness")
    args = parser.parse_args()

    root = args.root.resolve()
    manifest = (args.manifest or root / "manifest.csv").resolve()
    problems: list[str] = []
    warnings: list[str] = []
    totals: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: {"clips": 0, "seconds": 0.0})
    positive_speakers: dict[str, set[str]] = defaultdict(set)
    seen_paths: set[str] = set()

    if not manifest.is_file():
        print(f"Missing manifest: {manifest}\nCreate it using the documented columns in README.md.", file=sys.stderr)
        return 2

    with manifest.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        required = {"path", "label", "split", "speaker_id"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            print(f"Manifest must contain columns: {', '.join(sorted(required))}", file=sys.stderr)
            return 2
        for row_number, row in enumerate(reader, start=2):
            rel = (row.get("path") or "").strip()
            label = (row.get("label") or "").strip().lower()
            split = (row.get("split") or "").strip().lower()
            speaker = (row.get("speaker_id") or "").strip()
            if not rel:
                problems.append(f"row {row_number}: path is empty")
                continue
            if rel in seen_paths:
                problems.append(f"row {row_number}: duplicate path {rel}")
                continue
            seen_paths.add(rel)
            if label not in LABELS:
                problems.append(f"row {row_number}: invalid label {label!r}")
                continue
            if split not in SPLITS:
                problems.append(f"row {row_number}: invalid split {split!r}")
                continue
            if split == "false_accept_eval" and label != "negative":
                problems.append(f"row {row_number}: false_accept_eval must contain negative audio only")
                continue
            if label == "positive" and split == "false_accept_eval":
                problems.append(f"row {row_number}: positive audio belongs in train or validation, not false_accept_eval")
                continue
            if label == "positive" and not speaker:
                problems.append(f"row {row_number}: positive clip requires speaker_id for leakage checks")
                continue
            candidate = (root / rel).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                problems.append(f"row {row_number}: path escapes dataset root: {rel}")
                continue
            if not candidate.is_file():
                problems.append(f"row {row_number}: audio file not found: {candidate}")
                continue
            try:
                _, _, _, seconds = inspect_wave(candidate)
            except (wave.Error, EOFError, OSError, ValueError) as error:
                problems.append(f"row {row_number}: invalid audio {candidate}: {error}")
                continue
            totals[(label, split)]["clips"] += 1
            totals[(label, split)]["seconds"] += seconds
            if label == "positive":
                positive_speakers[split].add(speaker)

    train_speakers = positive_speakers["train"]
    validation_speakers = positive_speakers["validation"]
    overlap = train_speakers & validation_speakers
    if overlap:
        problems.append("positive speaker leakage between train and validation: " + ", ".join(sorted(overlap)[:20]))

    train_pos = int(totals[("positive", "train")]["clips"])
    validation_pos = int(totals[("positive", "validation")]["clips"])
    eval_hours = totals[("negative", "false_accept_eval")]["seconds"] / 3600
    if train_pos < args.min_positive_train:
        warnings.append(f"positive train clips {train_pos} below upstream guide target {args.min_positive_train}")
    if validation_pos < args.min_positive_validation:
        warnings.append(f"positive validation clips {validation_pos} below configured target {args.min_positive_validation}")
    if eval_hours < args.min_negative_eval_hours:
        warnings.append(f"negative false-accept evaluation audio {eval_hours:.2f} h below {args.min_negative_eval_hours:.2f} h; measured FAR/hour would be weakly supported")
    if totals[("negative", "train")]["clips"] == 0:
        warnings.append("no negative training clips listed; official openWakeWord training also uses large background-feature datasets")

    report = {
        "dataset_root": str(root),
        "manifest": str(manifest),
        "format_required": {"encoding": "uncompressed PCM", "sample_rate_hz": EXPECTED_RATE, "channels": EXPECTED_CHANNELS, "sample_width_bytes": EXPECTED_WIDTH},
        "splits": {
            f"{label}/{split}": {"clips": int(values["clips"]), "hours": round(values["seconds"] / 3600, 4)}
            for (label, split), values in sorted(totals.items())
        },
        "positive_speakers_by_split": {split: len(speakers) for split, speakers in sorted(positive_speakers.items())},
        "errors": problems,
        "warnings": warnings,
        "training_ready": not problems and not warnings,
        "note": "Audit only; it does not train or validate an ONNX wake-word model."
    }
    print(json.dumps(report, indent=2))
    if problems:
        return 1
    if warnings and not args.allow_incomplete:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
