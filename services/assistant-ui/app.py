"""
Interface de chat de l'assistant documentaire, à la manière de Claude : une conversation, une zone de saisie
et des fichiers joints. Ni compte, ni historique, ni choix de modèle : la conversation vit dans la session du
navigateur et repart de zéro quand on recharge la page.

Les réponses viennent de rag-service (API compatible OpenAI, en flux) : la réflexion du modèle s'affiche dans
un bloc repliable, puis la réponse, rendue en Markdown avec ses sources.
"""
import base64
import json
import os
import re
import time
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path

import requests
import streamlit as st

RAG_SERVICE_URL = os.environ.get("RAG_SERVICE_URL", "http://rag-service:8000/api/rag/v1")
RAG_API_KEY = os.environ.get("RAG_API_KEY", "rag_dev_only_change_me")
MODEL_ID = "assistant-resilience"
# Formats que rag-service sait lire (services/rag-service/app/attachments.py)
FILE_TYPES = ["md", "markdown", "txt", "log", "yml", "yaml", "json", "csv", "pdf", "docx"]
# Question envoyée quand l'opérateur joint un fichier sans rien écrire
FILE_ONLY_QUESTION = "Que contient ce fichier ? Résume l'essentiel."
# Ajouté par rag-service avant la liste des extraits cités
SOURCES_MARKER = "\n\n---\n**Sources**"
# Connexion, puis attente maximale entre deux morceaux de réponse (modèle sur processeur)
TIMEOUT = (5, 300)


class AssistantError(Exception):
    """Message affiché à l'opérateur à la place de la réponse."""


# --- Échanges avec rag-service ------------------------------------------------------------------------

def ask(messages: list[dict]) -> Iterator[tuple[str, str]]:
    """Envoie la conversation à rag-service. Produit ("reasoning" | "content", texte) au fil de la réponse."""
    payload = {
        "model": MODEL_ID,
        "stream": True,
        "messages": [_api_message(m) for m in messages if m["role"] != "error"],
    }
    try:
        with requests.post(
            f"{RAG_SERVICE_URL}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {RAG_API_KEY}"},
            stream=True,
            timeout=TIMEOUT,
        ) as response:
            if response.status_code != 200:
                raise AssistantError(_error_message(response))
            for line in response.iter_lines():
                if line == b"data: [DONE]":
                    break
                if not line.startswith(b"data: "):
                    continue
                delta = json.loads(line[6:])["choices"][0]["delta"]
                if text := delta.get("reasoning_content"):
                    yield "reasoning", text
                if text := delta.get("content"):
                    yield "content", text
    except requests.Timeout as exc:
        raise AssistantError("L'assistant n'a pas répondu à temps. Réessayez.") from exc
    except requests.ConnectionError as exc:
        raise AssistantError(
            "L'assistant est injoignable : rag-service démarre ou est arrêté. Réessayez dans un instant."
        ) from exc
    except requests.RequestException as exc:
        raise AssistantError("La connexion avec l'assistant a été interrompue. Réessayez.") from exc


def _api_message(message: dict) -> dict:
    if message["role"] == "assistant":
        return {"role": "assistant", "content": message["content"]}
    text = message["content"] or FILE_ONLY_QUESTION
    if not message["files"]:
        return {"role": "user", "content": text}
    # Fichiers joints au format OpenAI : renvoyés à chaque question, ils restent dans la conversation
    return {
        "role": "user",
        "content": [{"type": "text", "text": text}] + [
            {"type": "file", "file": {"filename": f["name"], "file_data": f"data:{f['type']};base64,{f['data']}"}}
            for f in message["files"]
        ],
    }


def _error_message(response: requests.Response) -> str:
    if response.status_code == 401:
        return "rag-service refuse la clé de l'interface : RAG_API_KEY doit être la même des deux côtés."
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    return detail if isinstance(detail, str) else f"L'assistant a répondu par une erreur {response.status_code}."


# --- Affichage ------------------------------------------------------------------------------------------

def _plain(text: str) -> str:
    """Texte affiché tel quel là où Streamlit interprète le Markdown (rapport_final_v2.pdf)."""
    return re.sub(r"([\\`*_{}\[\]<>()#+\-.!|~$])", r"\\\1", text)


def _thinking_label(message: dict) -> str:
    seconds = message["thinking_seconds"]
    return "Réflexion" if seconds is None else f"Réflexion ({seconds} s)"


def show_content(content: str) -> None:
    body, marker, sources = content.partition(SOURCES_MARKER)
    st.markdown(body)
    if marker:
        st.caption("**Sources**" + sources)


def show_user(message: dict, index: int) -> None:
    with st.container(horizontal_alignment="right"):
        with st.container(key=f"user-{index}", width="content"):
            if message["files"]:
                with st.container(horizontal=True, gap="small"):
                    for file in message["files"]:
                        st.badge(_plain(file["name"]), icon=":material/attach_file:", color="gray")
            if message["content"]:
                st.markdown(message["content"])


def show_answer(message: dict, index: int) -> None:
    with st.container(key=f"assistant-{index}"):
        if message["reasoning"]:
            with st.status(_thinking_label(message), state="complete"):
                st.markdown(message["reasoning"])
        show_content(message["content"])
        if message["interrupted"]:
            st.caption("Réponse interrompue.")


def show_error(message: dict, index: int) -> None:
    st.error(message["content"], icon=":material/error:")


def reply(messages: list[dict]) -> None:
    """Affiche la réponse au fil de l'eau, puis l'ajoute à la conversation."""
    message = {"role": "assistant", "content": "", "reasoning": "", "thinking_seconds": None, "interrupted": True}
    error = None
    with st.container(key=f"assistant-{len(messages)}"):
        status_slot = st.empty()
        status = status_slot.status("Recherche dans la documentation…")
        thinking = status.empty()
        answer = st.empty()
        thinking_started = 0.0
        try:
            with closing(ask(messages)) as stream:
                for kind, text in stream:
                    if kind == "reasoning":
                        if not message["reasoning"]:
                            thinking_started = time.monotonic()
                            status.update(label="Réflexion…", expanded=True)
                        message["reasoning"] += text
                        thinking.markdown(message["reasoning"])
                        continue
                    if not message["content"]:
                        if message["reasoning"]:
                            message["thinking_seconds"] = round(time.monotonic() - thinking_started)
                            status.update(label=_thinking_label(message), state="complete", expanded=False)
                        else:
                            status_slot.empty()
                    message["content"] += text
                    with answer.container():
                        show_content(message["content"])
            message["interrupted"] = False
        except AssistantError as exc:
            error = str(exc)
        finally:
            # Aussi quand l'opérateur clique sur stop : ce qui a déjà été écrit reste dans la conversation
            if message["content"] or message["reasoning"]:
                messages.append(message)
            if error:
                messages.append({"role": "error", "content": error})
        if error:
            status_slot.empty()
            show_error({"content": error}, len(messages))


st.set_page_config(page_title="Assistant RESILIENCE", page_icon=":material/support_agent:")
st.html(Path(__file__).with_name("style.css"))

if "messages" not in st.session_state:
    st.session_state.messages = []
messages: list[dict] = st.session_state.messages

# Lu avant d'afficher la conversation (la zone de saisie reste de toute façon en bas de page) : le message
# envoyé s'affiche tout de suite, sans écran d'accueil au-dessus
prompt = st.chat_input(
    "Écrivez votre question…",
    accept_file="multiple",
    file_type=FILE_TYPES,
    # Pendant la réponse, le bouton d'envoi devient un bouton stop
    submit_mode="stop",
)
if prompt:
    messages.append({
        "role": "user",
        "content": prompt.text.strip(),
        "files": [
            {"name": f.name, "type": f.type or "application/octet-stream", "data": base64.b64encode(f.getvalue()).decode()}
            for f in prompt.files
        ],
    })

# Emplacement fixe en tête de page : dès le premier message, l'accueil est remplacé par un élément vide au lieu
# de rester affiché en grisé jusqu'à la fin de la réponse
greeting = st.empty()
if not messages:
    with greeting.container(key="greeting"):
        st.markdown("## Comment puis-je vous aider ?", text_alignment="center", anchors=False)
        st.caption(
            "Je réponds à partir de la documentation de l'équipe et des fichiers que vous joignez, en citant "
            "mes sources. Je n'agis jamais sur le système.",
            text_alignment="center",
        )

show = {"user": show_user, "assistant": show_answer, "error": show_error}
for index, message in enumerate(messages):
    show[message["role"]](message, index)

if prompt:
    reply(messages)
