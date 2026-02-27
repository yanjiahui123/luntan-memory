import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { threadApi, feedbackApi, memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, StatusBadge, Badge, TimeAgo, ConfirmModal, KnowledgeTypeBadge } from '../components/UI';

export default function ThreadDetail() {
  const { threadId } = useParams();
  const { data: thread, loading, error, refetch } = useAsync(() => threadApi.get(threadId), [threadId]);
  const { data: comments, refetch: refetchComments } = useAsync(() => threadApi.comments(threadId), [threadId]);
  const [replyText, setReplyText] = useState('');
  const [resolveTarget, setResolveTarget] = useState(null);

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
        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{thread.content}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12, color: 'var(--text-ter)' }}>
          <span>👁 {thread.view_count} 浏览</span>
          <span>💬 {thread.comment_count} 回复</span>
          <TimeAgo date={thread.created_at} />
        </div>
      </div>

      {/* Comments */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>回答 ({comments?.length || 0})</h3>
      {comments?.map(c => (
        <CommentCard key={c.id} comment={c} thread={thread} onResolve={() => setResolveTarget(c.id)} />
      ))}

      {/* Reply box */}
      {thread.status === 'OPEN' && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <textarea placeholder="写下你的回答... (支持 Markdown)" value={replyText} onChange={e => setReplyText(e.target.value)} style={{ marginBottom: 12 }} />
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
    </div>
  );
}

function CommentCard({ comment, thread, onResolve }) {
  const [feedbackGiven, setFeedbackGiven] = useState(null);
  const [upvotes, setUpvotes] = useState(comment.upvote_count || 0);
  const [upvoted, setUpvoted] = useState(false);
  const [relatedMemories, setRelatedMemories] = useState(null);
  const [showMemories, setShowMemories] = useState(false);
  const isAi = comment.is_ai;
  const isBest = comment.is_best_answer;

  async function handleFeedback(type) {
    if (!comment.cited_memory_ids?.length) return;
    for (const mid of comment.cited_memory_ids) {
      await feedbackApi.submit(mid, { feedback_type: type });
    }
    setFeedbackGiven(type);
  }

  async function handleUpvote() {
    if (upvoted) return;
    try {
      const updated = await threadApi.upvoteComment(comment.thread_id, comment.id);
      setUpvotes(updated.upvote_count);
      setUpvoted(true);

      // Trigger memory search (decoupled from forum API)
      const result = await memoryApi.search({
        query: comment.content,
        namespace_id: thread.namespace_id,
        top_k: 3,
      });
      if (result.hits?.length > 0) {
        setRelatedMemories(result.hits);
        setShowMemories(true);
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

      <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{comment.content}</div>

      {isAi && comment.cited_memory_ids?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 8 }}>
          📎 引用记忆: {comment.cited_memory_ids.map(id => <Link key={id} to={`/admin/memories/${id}`} style={{ marginRight: 6 }}>[{id.slice(0, 8)}]</Link>)}
        </div>
      )}

      <div className="comment-actions">
        <button
          className={`btn-sm ${upvoted ? 'btn-primary' : 'btn-secondary'}`}
          onClick={handleUpvote}
          disabled={upvoted}
        >
          👍 {upvotes}
        </button>
        {isAi && (
          <>
            <button className={`btn-sm ${feedbackGiven === 'useful' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleFeedback('useful')}>有用</button>
            <button className={`btn-sm ${feedbackGiven === 'not_useful' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleFeedback('not_useful')}>没用</button>
            <button className={`btn-sm ${feedbackGiven === 'wrong' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => handleFeedback('wrong')}>错误</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {thread.status === 'OPEN' && !isBest && (
          <button className="btn-success" onClick={onResolve}>✓ 采纳此回答</button>
        )}
      </div>

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
                <Link to={`/admin/memories/${hit.memory.id}`} style={{ fontSize: 11, marginLeft: 'auto' }}>查看详情 →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
