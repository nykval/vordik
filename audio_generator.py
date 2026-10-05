"""Генерация британской озвучки слов Вордика через edge-tts."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterable

import edge_tts

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows uses the in-process lock below.
    fcntl = None


VOICE = "en-GB-SoniaNeural"
VOICE_NUMBER = 1
PROJECT_ROOT = Path(__file__).resolve().parent
AUDIO_DIR = Path(os.environ.get("VORDIK_AUDIO_DIR", PROJECT_ROOT / "audio")).resolve()
MAX_RETRIES = 3
RETRY_DELAY = 3

logger = logging.getLogger(__name__)
_audio_locks: dict[str, asyncio.Lock] = {}


def normalize_word(word: str) -> str:
    """Нормализует пробелы, не удаляя ``to`` из произносимого текста."""

    return " ".join(str(word).strip().split())


def make_audio_filename(word: str) -> str:
    """Возвращает безопасное имя вида ``toplay1.mp3``."""

    normalized = normalize_word(word)
    filename_word = re.sub(r"\s+", "", normalized)
    filename_word = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]', "", filename_word)
    while ".." in filename_word:
        filename_word = filename_word.replace("..", "")
    filename_word = filename_word.strip(".")
    if not filename_word:
        raise ValueError("Невозможно создать имя аудиофайла")
    filename = f"{filename_word}{VOICE_NUMBER}.mp3"
    output_path = (AUDIO_DIR / filename).resolve()
    if output_path.parent != AUDIO_DIR:
        raise ValueError("Небезопасное имя аудиофайла")
    return filename


def get_audio_path(word: str) -> Path:
    return AUDIO_DIR / make_audio_filename(word)


def find_existing_audio(word: str) -> Path | None:
    """Ищет готовую дорожку, включая прежнюю папку ``audio/common``."""

    filename = make_audio_filename(word)
    for path in (AUDIO_DIR / filename, AUDIO_DIR / "common" / filename):
        try:
            if path.is_file() and path.stat().st_size > 0:
                return path
        except OSError:
            continue
    return None


def audio_exists(word: str) -> bool:
    return find_existing_audio(word) is not None


def get_lock(filename: str) -> asyncio.Lock:
    if filename not in _audio_locks:
        _audio_locks[filename] = asyncio.Lock()
    return _audio_locks[filename]


@asynccontextmanager
async def cross_process_lock(filename: str):
    """Не позволяет разным backend-процессам писать один MP3 одновременно."""

    lock_path = AUDIO_DIR / f".{filename}.lock"
    handle = lock_path.open("a+b")
    try:
        if fcntl is not None:
            await asyncio.to_thread(fcntl.flock, handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            await asyncio.to_thread(fcntl.flock, handle.fileno(), fcntl.LOCK_UN)
        handle.close()


async def generate_audio(word: str) -> str:
    """Создаёт отсутствующий MP3 и возвращает его имя."""

    normalized = normalize_word(word)
    if not normalized:
        raise ValueError("Пустое слово")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filename = make_audio_filename(normalized)
    if audio_exists(normalized):
        return filename

    async with get_lock(filename):
        async with cross_process_lock(filename):
            if audio_exists(normalized):
                return filename

            output_path = AUDIO_DIR / filename
            temp_path = AUDIO_DIR / f".{filename}.{os.getpid()}.tmp"
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    temp_path.unlink(missing_ok=True)
                    communicator = edge_tts.Communicate(text=normalized, voice=VOICE)
                    await communicator.save(str(temp_path))
                    if not temp_path.is_file() or temp_path.stat().st_size <= 0:
                        raise RuntimeError("edge-tts создал пустой файл")
                    temp_path.replace(output_path)
                    logger.info("Создано аудио %s -> %s", normalized, filename)
                    return filename
                except Exception:
                    logger.exception(
                        "Ошибка генерации %s. Попытка %s/%s",
                        normalized,
                        attempt,
                        MAX_RETRIES,
                    )
                    temp_path.unlink(missing_ok=True)
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(RETRY_DELAY)

            raise RuntimeError(f"Не удалось создать аудио для: {normalized}")


async def generate_missing_audio(words: Iterable[str], concurrency: int = 3) -> dict:
    """Создаёт только отсутствующие дорожки и возвращает статистику."""

    semaphore = asyncio.Semaphore(max(1, int(concurrency)))
    created = 0
    skipped = 0
    errors: list[tuple[str, str]] = []

    async def process(raw_word: str) -> None:
        nonlocal created, skipped
        word = normalize_word(raw_word)
        if not word:
            return
        if audio_exists(word):
            skipped += 1
            return
        async with semaphore:
            try:
                await generate_audio(word)
                created += 1
            except Exception as error:
                errors.append((word, str(error)))

    await asyncio.gather(*(process(word) for word in words))
    return {"created": created, "skipped": skipped, "errors": errors}


def relative_audio_path(word: str) -> str | None:
    existing = find_existing_audio(word)
    if existing is None:
        return None
    return existing.relative_to(AUDIO_DIR).as_posix()


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Создать озвучку одного английского слова")
    parser.add_argument("--word", required=True)
    parser.add_argument("--json", action="store_true")
    arguments = parser.parse_args()
    try:
        filename = await generate_audio(arguments.word)
        result = {
            "filename": filename,
            "relativePath": relative_audio_path(arguments.word) or filename,
            "voice": VOICE,
        }
        print(json.dumps(result, ensure_ascii=False) if arguments.json else filename)
        return 0
    except Exception as error:
        logger.exception("Не удалось создать озвучку для %s", arguments.word)
        if arguments.json:
            print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(asyncio.run(_main()))
