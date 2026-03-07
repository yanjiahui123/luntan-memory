"""LLM prompt templates for extraction, AUDN, and AI answer."""

# ---------------------------------------------------------------------------
# Stage 1: Structure — parse discussion into structured intermediate form
# ---------------------------------------------------------------------------

STRUCTURE_SYSTEM = """You are a knowledge structuring engine.
Given a resolved forum thread, extract and organize the core information into a structured JSON format.

Output EXACTLY one JSON object:
{
  "problem": "The specific problem or question being addressed",
  "context": "Environment, background, and preconditions (null if not mentioned)",
  "root_cause": "Root cause analysis (null if not applicable)",
  "solution": "The accepted solution or answer",
  "verification": "How to verify the solution works (null if not mentioned)",
  "caveats": ["Warning or limitation 1", "Warning or limitation 2"]
}

Rules:
- Use null for fields that have no content in the thread.
- Do NOT invent information not present in the thread.
- caveats is an array; use [] if there are none."""

STRUCTURE_USER = """Thread title: {title}

Question:
{question}

Discussion and answer:
{discussion}

Extract the structured information:"""


# ---------------------------------------------------------------------------
# Stage 2: Atomize — extract atomic knowledge points from structured form
# ---------------------------------------------------------------------------

ATOMIZE_SYSTEM = """You are a knowledge atomization engine.
Given structured knowledge from a resolved forum thread, extract atomic, reusable knowledge points.

Each knowledge point must include:
- "what": The specific knowledge content (clear, self-contained statement)
- "when": Applicable conditions or scenarios
- "how": Concrete steps or commands (null if not applicable)
- "why": Reason or underlying principle (null if not applicable)
- "tags": 1-3 short, broad category words (e.g. "K8s", "timeout", "config")
- "knowledge_type": One of "how_to|troubleshoot|best_practice|gotcha|faq"

Output a JSON array:
[{"what": "...", "when": "...", "how": null|"...", "why": null|"...", "tags": [...], "knowledge_type": "..."}]

Rules:
- Each knowledge point must be self-contained (understandable without the original thread).
- Each knowledge point should cover a single, distinct concept.
- Do NOT create redundant or overlapping knowledge points.
- If no reusable knowledge can be extracted, return []."""

ATOMIZE_USER = """Structured thread knowledge:
{structured}

Extract atomic knowledge points as JSON:"""


# ---------------------------------------------------------------------------
# Stage 3: Gate — quality control for each knowledge point
# ---------------------------------------------------------------------------

GATE_SYSTEM = """You are a knowledge quality gatekeeper.
Evaluate each knowledge point on three criteria:
1. Self-contained: Can it be understood without the original thread context?
2. General: Is it applicable beyond the specific questioner's unique environment?
3. Specific: Does it contain actionable information (not vague platitudes)?

Return the same JSON array with two additional fields per item:
- "pass_gate": true if the knowledge point passes ALL three criteria, false otherwise
- "gate_reason": Brief explanation of why it passed or failed

A knowledge point FAILS if it:
- Is too vague (e.g., "Configure the settings appropriately")
- Depends entirely on context specific to one user's environment
- States only a general fact with no actionable value
- Duplicates another item in the same list"""

GATE_USER = """Knowledge points to evaluate:
{knowledge_points}

Return the same array with pass_gate and gate_reason fields added:"""


# ---------------------------------------------------------------------------
# Legacy single-stage extraction (kept for reference, not used in pipeline)
# ---------------------------------------------------------------------------

FACT_EXTRACTION_SYSTEM = """You are a knowledge extraction engine.
Given a resolved forum thread (question + discussion + accepted answer), extract atomic, reusable knowledge facts.

Rules:
- Each fact must be self-contained and understandable without the original thread.
- Output as a JSON array of objects: [{"content": "...", "tags": ["..."], "knowledge_type": "how_to|troubleshoot|best_practice|gotcha|faq"}]
- tags: use 1-3 short, broad category words only (e.g. "K8s", "timeout", "config"). Do NOT write sentence-length tags or overly specific values.
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
Given relevant memories (knowledge facts) and optional knowledge base references, compose a helpful answer to the user's question.
Cite memories by their ID like [M-<short_id>].
When using knowledge base information, indicate it comes from the knowledge base.
If neither memories nor knowledge base contain relevant information, say you don't have enough information."""

AI_ANSWER_USER = """Question: {question}

Relevant memories:
{memories}

Knowledge base references:
{rag_context}

Your answer:"""
