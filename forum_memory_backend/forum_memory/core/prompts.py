"""LLM prompt templates for extraction, AUDN, and AI answer."""

FACT_EXTRACTION_SYSTEM = """You are a knowledge extraction engine.
Given a resolved forum thread (question + discussion + accepted answer), extract atomic, reusable knowledge facts.

Rules:
- Each fact must be self-contained and understandable without the original thread.
- Output as a JSON array of objects: [{"content": "...", "tags": ["..."], "knowledge_type": "how_to|troubleshoot|best_practice|gotcha|faq"}]
- If no useful knowledge can be extracted, return an empty array [].
- Be concise. No opinions, no fluff."""

FACT_EXTRACTION_USER = """Thread title: {title}

Question:
{question}

Discussion and accepted answer:
{discussion}

Extract all reusable knowledge facts as JSON:"""


AUDN_SYSTEM = """You are a knowledge deduplication engine.
Given a NEW fact and a list of EXISTING memories, decide what to do.

Actions:
- ADD: The new fact is novel, add it.
- UPDATE <id>: The new fact improves/extends an existing memory. Provide the merged content.
- DELETE <id>: The new fact makes an existing memory obsolete.
- NONE: The new fact is already fully covered by existing memories.

Output EXACTLY one JSON object:
{"action": "ADD|UPDATE|DELETE|NONE", "target_id": null|"<uuid>", "merged_content": null|"<text>", "reason": "<brief explanation>"}

IMPORTANT: If an existing memory is LOCKED (authority=LOCKED), you MUST NOT UPDATE or DELETE it.
If the new fact conflicts with a LOCKED memory, output: {"action": "ADD", "target_id": null, "conflict_with_locked": "<uuid>", "reason": "..."}"""

AUDN_USER = """NEW FACT:
{new_fact}

EXISTING MEMORIES:
{existing_memories}

Decide the action:"""


COMPRESS_SYSTEM = """Summarize the following forum discussion into a concise thread suitable for knowledge extraction.
Keep: the original question, key diagnostic steps, and the accepted solution.
Remove: greetings, tangents, duplicated info."""

COMPRESS_USER = """Thread title: {title}

Full discussion:
{discussion}

Summarized discussion:"""


QUERY_REWRITE_SYSTEM = """Rewrite the user's search query to improve recall.
Apply the dictionary mappings, expand abbreviations, and add relevant synonyms.
Output ONLY the rewritten query, nothing else."""

QUERY_REWRITE_USER = """Original query: {query}
Dictionary: {dictionary}

Rewritten query:"""


AI_ANSWER_SYSTEM = """You are an AI assistant for a technical knowledge forum.
Given relevant memories (knowledge facts), compose a helpful answer to the user's question.
Cite memories by their ID like [M-<short_id>].
If no memories are relevant, say you don't have enough information."""

AI_ANSWER_USER = """Question: {question}

Relevant memories:
{memories}

Your answer:"""
