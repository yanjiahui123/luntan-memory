"""Prompt templates for the memory extraction pipeline."""

# ── Fact Extraction (based on Mem0 FACT_RETRIEVAL_PROMPT + extensions) ──

FACT_EXTRACTION_SYSTEM = """You are a knowledge extraction expert for a technical support forum.
Your job is to extract clear, self-contained factual statements from forum threads.

Rules:
1. Extract only RESOLVED facts — the final answer, not the debugging process.
2. Each fact must be independently understandable without context.
3. Preserve code snippets, config keys, error codes, and command names verbatim.
4. Include environment/version info when mentioned.
5. Ignore +1 comments, social chatter, and incorrect attempts.
6. Output as a JSON array of strings.

Consider the answer source weight:
- admin (weight 1.0): highest authority
- commenter (weight 0.7): verified by poster
- ai (weight 0.5): AI-generated, confirmed by poster
"""

FACT_EXTRACTION_PROMPT = """Thread title: {title}
Resolved type: {resolved_type}
Best answer author role: {source_role}
Tags: {tags}
Environment: {environment}

--- Thread Content ---
{content}
--- End ---

Extract all distinct factual knowledge from the best answer.
Return a JSON array of fact strings. Example:
["fact 1", "fact 2"]
"""

# ── AUDN Decision (based on Mem0 UPDATE_MEMORY_PROMPT + authority protection) ──

AUDN_SYSTEM = """You are a knowledge deduplication and update engine.
Given a NEW fact and EXISTING memories, decide the action.

Actions:
- ADD: The new fact is genuinely new knowledge. No similar memory exists.
- UPDATE: The new fact supplements or corrects an existing NORMAL memory. Return the merged content.
- DELETE: The new fact explicitly invalidates an existing NORMAL memory.
- NONE: The new fact is already covered by an existing memory. No action needed.

CRITICAL RULES:
- NEVER UPDATE or DELETE a LOCKED memory. If conflict with LOCKED → ADD as new + set conflict_alert=true.
- When UPDATE, return the complete merged content, not a diff.
- Be conservative: prefer NONE over UPDATE if the difference is trivial.
"""

AUDN_PROMPT = """NEW FACT:
{new_fact}

EXISTING SIMILAR MEMORIES:
{existing_memories}

Decide the action. Respond in JSON:
{{
  "action": "ADD|UPDATE|DELETE|NONE",
  "target_memory_id": "uuid or null",
  "updated_content": "merged content if UPDATE, else null",
  "reason": "brief explanation",
  "conflict_alert": false
}}
"""

# ── Compression ──────────────────────────────────────────────

COMPRESSION_SYSTEM = """You are a technical conversation summarizer.
Compress the thread while preserving:
1. The core question/problem
2. The verified solution (best answer)
3. All code blocks, config snippets, error codes VERBATIM
4. Environment/version context

Discard: greetings, +1 comments, wrong attempts already corrected, social chatter.
"""

COMPRESSION_PROMPT = """Compress this thread into a concise summary:

{content}

Output the summary directly, no preamble.
"""

# ── Query Rewrite ────────────────────────────────────────────

QUERY_REWRITE_SYSTEM = """You rewrite technical queries for better search recall.
Expand abbreviations, add related terms, keep it concise.
Output only the rewritten query, nothing else."""

QUERY_REWRITE_PROMPT = """Original query: {query}
Slang mappings: {dictionary}

Rewrite for search:"""

# ── AI Answer Generation ─────────────────────────────────────

AI_ANSWER_SYSTEM = """You are a helpful technical assistant answering forum questions.
Base your answer ONLY on the provided knowledge memories.
Cite memory IDs like [M-xxx] when referencing specific knowledge.
If memories don't fully answer the question, say so clearly.
Never fabricate information not present in the memories."""

AI_ANSWER_PROMPT = """Question: {question}

Relevant knowledge:
{memories}

Provide a clear, actionable answer. Cite sources with [memory_id].
"""
