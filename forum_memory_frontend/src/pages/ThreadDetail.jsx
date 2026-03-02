import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { threadApi, feedbackApi, memoryApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, StatusBadge, Badge, TimeAgo, ConfirmModal, KnowledgeTypeBadge, QualityDot } from '../components/UI';
import ImagePasteTextarea from '../components/ImagePasteTextarea';

/** Render text with markdown images: ![alt](url) → <img> tags */
function renderMarkdownContent(text) {
  if (!text) return null;
  const parts = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <img
        key={key++}
        src={match[2]}
        alt={match[1]}
        style={{ maxWidth: '100%', borderRadius: 'var(--radius)', margin: '8px 0', display: 'block' }}
      />
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : text;
}

export default function ThreadDetail() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { data: thread, loading, error, refetch } = useAsync(() => threadApi.get(threadId), [threadId]);
  const { data: comments, refetch: refetchComments } = useAsync(() => threadApi.comments(threadId), [threadId]);
  const { data: me } = useAsync(() => userApi.me(), []);
  const [replyText, setReplyText] = useState('');
  const [resolveTarget, setResolveTarget] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isSuperAdmin = me?.role === 'super_admin';
  const isAdmin = me?.role === 'super_admin' || me?.role === 'board_admin';

  async function handleReply() {
    if (!replyText.trim()) return;
    await threadApi.addComment(threadId, replyText);
    setReplyText('');
    refetchComments();
  }

  async function handleResolve() {
    await threadApi.resolve(threadId, resolveTarget);
    setResolveTarget(null);
    refetch();
    refetchComments();
  }

  // Auto-poll for AI answer on new threads (first 2 minutes, every 10s)
  useEffect(() => {
    if (thread?.status === 'OPEN' && thread?.comment_count === 0) {
      const interval = setInterval(() => refetchComments(), 10000);
      const timeout = setTimeout(() => clearInterval(interval), 120000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [thread?.id, thread?.comment_count]);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!thread) return null;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span>
        <Link to={`/boards/${thread.namespace_id}/threads`}>帖子列表</Link> <span>›</span>
        <span>详情</span>
      </div>

      {/* Question */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <StatusBadge status={thread.status} />
          {thread.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
          {thread.environment && <Badge type="gray">🌍 {thread.environment}</Badge>}
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{thread.title}</h1>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{renderMarkdownContent(thread.content)}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12, color: 'var(--text-ter)', alignItems: 'center' }}>
          <span>👁 {thread.view_count} 浏览</span>
          <span>💬 {thread.comment_count} 回复</span>
          <TimeAgo date={thread.created_at} />
          {isSuperAdmin && (
            <button
              className="btn-sm btn-danger"
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowDeleteConfirm(true)}
            >
              删除帖子
            </button>
          )}
        </div>
      </div>

      {/* AI Answer + Comments */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>回答 ({comments?.length || 0})</h3>
        {thread.status === 'OPEN' && (
          <button
            className="btn-primary"
            disabled={aiLoading}
            onClick={async () => {
              setAiLoading(true);
              try {
                await threadApi.aiAnswer(threadId);
                refetchComments();
              } catch (err) {
                alert('AI 回答生成失败: ' + err.message);
              } finally {
                setAiLoading(false);
              }
            }}
          >
            {aiLoading ? '生成中...' : '🤖 重新生成 AI 回答'}
          </button>
        )}
      </div>

      {/* AI auto-answer waiting indicator */}
      {thread.status === 'OPEN' && (!comments || comments.length === 0) && (
        <div className="card" style={{ padding: 16, marginBottom: 12, textAlign: 'center', color: 'var(--text-sec)', fontSize: 13 }}>
          AI 正在分析您的问题，回答将在稍后自动出现...
        </div>
      )}
      {comments?.map(c => (
        <CommentCard key={c.id} comment={c} thread={thread} onResolve={() => setResolveTarget(c.id)} onDelete={refetchComments} isAdmin={isAdmin} />
      ))}

      {/* Reply box */}
      {thread.status === 'OPEN' && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <ImagePasteTextarea placeholder="写下你的回答... (支持粘贴图片和 Markdown)" value={replyText} onChange={setReplyText} style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleReply} disabled={!replyText.trim()}>发送回复</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!resolveTarget}
        title="采纳此回答"
        message="确认采纳并关闭帖子？关闭后系统将自动提取知识到记忆库。"
        onConfirm={handleResolve}
        onCancel={() => setResolveTarget(null)}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除帖子"
        message="确认删除此帖子？删除后帖子将不再显示在列表中。"
        onConfirm={async () => {
          await threadApi.delete(threadId);
          setShowDeleteConfirm(false);
          navigate(`/boards/${thread.namespace_id}/threads`);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function CommentCard({ comment, thread, onResolve, onDelete, isAdmin }) {
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const [upvotes, setUpvotes] = useState(comment.upvote_count || 0);
  const [upvoted, setUpvoted] = useState(false);
  const [relatedMemories, setRelatedMemories] = useState(null);
  const [showMemories, setShowMemories] = useState(false);
  const [citedMemories, setCitedMemories] = useState(null);
  const [showCitations, setShowCitations] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAi = comment.is_ai;
  const isBest = comment.is_best_answer;
  const hasCitations = comment.cited_memory_ids?.length > 0;

  async function handleDelete() {
    try {
      await threadApi.deleteComment(comment.thread_id, comment.id);
      setShowDeleteConfirm(false);
      if (onDelete) onDelete();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // Load cited memory details for AI comments
  useEffect(() => {
    if (isAi && hasCitations) {
      memoryApi.batchGet(comment.cited_memory_ids).then(setCitedMemories).catch(() => {});
    }
  }, [isAi, comment.cited_memory_ids]);

  async function handleFeedback(type) {
    if (!hasCitations) return;
    try {
      if (feedbackGiven === type) {
        // Toggle off: withdraw feedback
        for (const mid of comment.cited_memory_ids) {
          await feedbackApi.withdraw(mid, { feedback_type: type });
        }
        setFeedbackGiven(null);
      } else {
        // Submit new feedback
        for (const mid of comment.cited_memory_ids) {
          await feedbackApi.submit(mid, { feedback_type: type });
        }
        setFeedbackGiven(type);
      }
    } catch (err) {
      console.error('Feedback failed:', err);
    }
  }

  async function handleUpvote() {
    try {
      const result = await threadApi.upvoteComment(comment.thread_id, comment.id);
      setUpvotes(result.upvote_count);
      setUpvoted(result.voted);

      // Trigger memory search on first upvote
      if (result.voted && !relatedMemories) {
        const searchResult = await memoryApi.search({
          query: comment.content,
          namespace_id: thread.namespace_id,
          top_k: 3,
        });
        if (searchResult.hits?.length > 0) {
          setRelatedMemories(searchResult.hits);
          setShowMemories(true);
        }
      }
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  }

  return (
    <div className={`card comment-box ${isAi ? 'comment-box--ai' : ''} ${isBest ? 'comment-box--best' : ''}`}>
      <div className="comment-author">
        <div className="comment-avatar" style={{ background: isAi ? 'var(--purple-light)' : 'var(--accent-light)', color: isAi ? 'var(--purple)' : 'var(--accent)' }}>
          {isAi ? '🤖' : comment.author_role?.[0]?.toUpperCase() || 'U'}
        </div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{isAi ? 'AI 助手' : `用户 ${comment.author_role}`}</span>
        {isAi && <Badge type="purple">自动回复</Badge>}
        {isBest && <Badge type="green">✓ 最佳回答</Badge>}
        {comment.author_role === 'admin' && <Badge type="amber">管理员</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-ter)' }}><TimeAgo date={comment.created_at} /></span>
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{renderMarkdownContent(comment.content)}</div>

      {/* Collapsible citation cards */}
      {isAi && (hasCitations || comment.rag_context) && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn-sm btn-secondary"
            onClick={() => setShowCitations(!showCitations)}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            📎 引用了 {comment.cited_memory_ids?.length || 0} 条知识记忆
            {comment.rag_context ? ' + 📚知识库' : ''}
            {' '}{showCitations ? '▾' : '▸'}
          </button>

          {showCitations && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--purple-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {/* Memory citation cards */}
              {citedMemories ? citedMemories.map((mem, i) => (
                <div key={mem.id} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                    {mem.content.length > 120 ? mem.content.slice(0, 120) + '...' : mem.content}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    {mem.knowledge_type && <KnowledgeTypeBadge type={mem.knowledge_type} />}
                    {mem.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
                    <QualityDot score={mem.quality_score} />
                    {mem.source_id && (
                      <Link to={`/threads/${mem.source_id}`} style={{ fontSize: 11, color: 'var(--text-sec)' }}>来源帖子</Link>
                    )}
                    {isAdmin && (
                      <Link to={`/admin/memories/${mem.id}`} style={{ fontSize: 11, marginLeft: 'auto' }}>查看详情 →</Link>
                    )}
                  </div>
                </div>
              )) : hasCitations && (
                <div style={{ fontSize: 12, color: 'var(--text-ter)', padding: '4px 0' }}>加载中...</div>
              )}

              {/* RAG knowledge base section */}
              {comment.rag_context && (
                <div style={{
                  marginTop: citedMemories?.length > 0 ? 10 : 0,
                  paddingTop: citedMemories?.length > 0 ? 10 : 0,
                  borderTop: citedMemories?.length > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 4 }}>
                    📚 知识库参考
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                    {comment.rag_context.length > 300
                      ? comment.rag_context.slice(0, 300) + '...'
                      : comment.rag_context}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="comment-actions">
        <button
          className={`btn-sm ${upvoted ? 'btn-primary' : 'btn-secondary'}`}
          onClick={handleUpvote}
        >
          👍 {upvotes}
        </button>
        {isAi && hasCitations && (
          <>
            <button className={`btn-sm ${feedbackGiven === 'useful' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleFeedback('useful')}>有用</button>
            <button className={`btn-sm ${feedbackGiven === 'not_useful' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleFeedback('not_useful')}>没用</button>
            <button className={`btn-sm ${feedbackGiven === 'wrong' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => handleFeedback('wrong')}>错误</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {!isBest && (
          <button className="btn-sm btn-danger" onClick={() => setShowDeleteConfirm(true)} style={{ fontSize: 11 }}>删除</button>
        )}
        {thread.status === 'OPEN' && !isBest && (
          <button className="btn-success" onClick={onResolve}>✓ 采纳此回答</button>
        )}
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除评论"
        message="确认删除此评论？如果帖子已解决，将重新提取知识记忆。"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Related memories from upvote */}
      {showMemories && relatedMemories?.length > 0 && (
        <div style={{ marginTop: 10, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-sec)' }}>🧠 相关知识</span>
            <button className="btn-sm btn-secondary" onClick={() => setShowMemories(false)} style={{ fontSize: 11 }}>收起</button>
          </div>
          {relatedMemories.map((hit, i) => (
            <div key={i} style={{ padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ lineHeight: 1.6, color: 'var(--text)' }}>
                {hit.memory.content.length > 100 ? hit.memory.content.slice(0, 100) + '...' : hit.memory.content}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                {hit.memory.knowledge_type && <KnowledgeTypeBadge type={hit.memory.knowledge_type} />}
                <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>相关度 {hit.score.toFixed(2)}</span>
                {isAdmin && (
                  <Link to={`/admin/memories/${hit.memory.id}`} style={{ fontSize: 11, marginLeft: 'auto' }}>查看详情 →</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
