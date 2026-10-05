"""Отдельная команда заполнения отсутствующей озвучки общего словаря."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from pathlib import Path

from audio_generator import generate_missing_audio


PROJECT_ROOT = Path(__file__).resolve().parent


def load_catalog_words(catalog_path: Path) -> list[str]:
    source = catalog_path.read_text(encoding="utf-8")
    match = re.search(r"window\.VORDIK_WORD_CATALOG\s*=\s*(\[.*\]);\s*\}\)\(\);", source, re.DOTALL)
    if not match:
        raise ValueError(f"Не удалось прочитать каталог: {catalog_path}")
    entries = json.loads(match.group(1))
    return list(dict.fromkeys(str(entry.get("word", "")).strip() for entry in entries if entry.get("word")))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Создать отсутствующие аудио общего словаря")
    parser.add_argument("--catalog", type=Path, default=PROJECT_ROOT / "word-catalog.js")
    parser.add_argument("--concurrency", type=int, default=3)
    arguments = parser.parse_args()
    words = load_catalog_words(arguments.catalog.resolve())
    result = await generate_missing_audio(words, arguments.concurrency)
    print(f"Создано: {result['created']}")
    print(f"Уже существовало: {result['skipped']}")
    print(f"Ошибок: {len(result['errors'])}")
    for word, error in result["errors"]:
        logging.error("%s: %s", word, error)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    asyncio.run(main())
