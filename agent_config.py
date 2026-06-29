"""
agent_config.py
----------------
Central configuration for the AU Voice Assistant (Local Edition).

This file defines two things:
1. AGENT IDENTITY  - who the assistant is, how it should speak/behave
2. TOOL WHITELIST   - exactly which OS-level actions it is permitted to run

Keep this file as the single source of truth. Other modules
(listener.py, speaker.py, executor.py, etc.) should import from here
rather than hardcoding values, so permissions stay auditable in one place.
"""

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional


# ============================================================
# 1. AGENT IDENTITY
# ============================================================

@dataclass
class AgentIdentity:
    name: str = "AU"
    wake_word: str = "hey au"
    persona: str = (
        "You are AU, a calm, concise local voice assistant. "
        "You run fully offline using a local LLM (Ollama). "
        "You speak in short, natural sentences suited for text-to-speech. "
        "You never invent system actions you cannot actually perform — "
        "you only call tools from the approved whitelist."
    )
    language: str = "en-IN"
    voice_rate: int = 175          # pyttsx3 speech rate (words/min)
    voice_volume: float = 1.0      # 0.0 - 1.0
    voice_id_hint: Optional[str] = None  # e.g. "Microsoft Heera" / "english-us"

    # LLM backend (Ollama) settings
    ollama_model: str = "llama3.1:8b"
    ollama_host: str = "http://localhost:11434"
    temperature: float = 0.4
    max_response_tokens: int = 256

    # Behavior
    confirm_before_acting: bool = True   # ask "Do you want me to proceed?" for risky actions
    log_conversations: bool = True
    log_path: str = "logs/conversation_log.txt"


IDENTITY = AgentIdentity()


# ============================================================
# 2. TOOL / AUTOMATION WHITELIST
# ============================================================
#
# Each entry describes one permitted OS-level capability.
# `risk_level` drives whether confirmation is required before execution:
#   "low"    -> runs immediately
#   "medium" -> confirm if IDENTITY.confirm_before_acting is True
#   "high"   -> always confirm, regardless of the setting above

@dataclass
class ToolPermission:
    name: str
    description: str
    risk_level: str = "low"          # "low" | "medium" | "high"
    enabled: bool = True
    handler: Optional[Callable] = None   # bind actual function in executor.py


TOOL_WHITELIST: Dict[str, ToolPermission] = {
    "open_application": ToolPermission(
        name="open_application",
        description="Launch a desktop application by name (e.g. 'notepad', 'chrome').",
        risk_level="low",
    ),
    "close_application": ToolPermission(
        name="close_application",
        description="Close a running application by name.",
        risk_level="medium",
    ),
    "search_web": ToolPermission(
        name="search_web",
        description="Open default browser and search a query.",
        risk_level="low",
    ),
    "get_datetime": ToolPermission(
        name="get_datetime",
        description="Return the current date/time.",
        risk_level="low",
    ),
    "play_media": ToolPermission(
        name="play_media",
        description="Play a local media file or system media controls (play/pause/next).",
        risk_level="low",
    ),
    "set_volume": ToolPermission(
        name="set_volume",
        description="Adjust system volume level.",
        risk_level="low",
    ),
    "take_screenshot": ToolPermission(
        name="take_screenshot",
        description="Capture and save a screenshot to disk.",
        risk_level="medium",
    ),
    "read_file": ToolPermission(
        name="read_file",
        description="Read contents of a file from an explicitly allowed directory.",
        risk_level="medium",
    ),
    "write_file": ToolPermission(
        name="write_file",
        description="Create or overwrite a file in an explicitly allowed directory.",
        risk_level="high",
    ),
    "shutdown_system": ToolPermission(
        name="shutdown_system",
        description="Shut down or restart the machine.",
        risk_level="high",
        enabled=False,   # disabled by default — flip to True only if you really want this
    ),
    "run_shell_command": ToolPermission(
        name="run_shell_command",
        description="Execute an arbitrary shell command.",
        risk_level="high",
        enabled=True,
    ),
    "play_spotify": ToolPermission(
        name="play_spotify",
        description="Search and play a song, playlist or artist on Spotify.",
        risk_level="low",
        enabled=True,
    ),
}

# Directories write_file/read_file are allowed to touch.
# Anything outside these paths should be rejected by executor.py.
ALLOWED_FILE_PATHS: List[str] = [
    "./workspace",
    "./logs",
]


# ============================================================
# Helper accessors
# ============================================================

def get_enabled_tools() -> Dict[str, ToolPermission]:
    """Return only tools currently enabled for use."""
    return {k: v for k, v in TOOL_WHITELIST.items() if v.enabled}


def requires_confirmation(tool_name: str) -> bool:
    """Decide whether a given tool call needs user confirmation before running."""
    tool = TOOL_WHITELIST.get(tool_name)
    if tool is None:
        return True  # unknown tool -> always confirm / reject
    if tool.risk_level == "high":
        return True
    if tool.risk_level == "medium":
        return IDENTITY.confirm_before_acting
    return False


if __name__ == "__main__":
    print(f"Agent: {IDENTITY.name} (wake word: '{IDENTITY.wake_word}')")
    print(f"Model: {IDENTITY.ollama_model} @ {IDENTITY.ollama_host}")
    print("\nEnabled tools:")
    for name, tool in get_enabled_tools().items():
        print(f"  - {name} [{tool.risk_level}] confirm={requires_confirmation(name)}")
