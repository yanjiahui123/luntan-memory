import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { threadApi, feedbackApi, memoryApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, StatusBadge, Badge, TimeAgo, ConfirmModal, KnowledgeTypeBadge, QualityDot, AuthorityBadge } from '../components/UI';
import ImagePasteTextarea from '../components/ImagePasteTextarea';

function MarkdownContent({ content, style }) {
  if (!content) return null;
  return (
    <div className="md-body" style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
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
  const [pollStatus, setPollStatus] = useState('idle'); // 'idle' | 'polling' | 'done'
  const [dots, setDots] = useState('');
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

  // Progressive backoff polling for AI answer (~5 minutes total)
  useEffect(() => {
    if (thread?.status === 'OPEN' && thread?.comment_count === 0) {
      setPollStatus('polling');
      const intervals = [3000, 3000, 5000, 5000, 10000, 10000, 15000, 15000, 30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000];
      let step = 0;
      let timer = null;

      function poll() {
        refetchComments();
        step++;
        if (step < intervals.length) {
          timer = setTimeout(poll, intervals[step]);
        } else {
          setPollStatus('done');
        }
      }

      timer = setTimeout(poll, intervals[0]);
      return () => { clearTimeout(timer); setPollStatus('idle'); };
    }
  }, [thread?.id, thread?.comment_count]);

  // Stop polling once comments arrive
  useEffect(() => {
    if (comments?.length > 0 && pollStatus === 'polling') {
      setPollStatus('done');
    }
  }, [comments?.length, pollStatus]);

  // Animated dots for polling indicator
  useEffect(() => {
    if (pollStatus !== 'polling') return;
    const timer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(timer);
  }, [pollStatus]);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!thread) return null;

  return (
    <div>
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
        <MarkdownContent content={thread.content} style={{ fontSize: 14, color: 'var(--text)' }} />
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
          {pollStatus === 'polling' && (
            <>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                AI 正在分析您的问题{dots}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-ter)' }}>回答将在稍后自动出现，请稍候...</div>
            </>
          )}
          {pollStatus === 'done' && (
            <>
              <div style={{ marginBottom: 8 }}>AI 分析可能仍在进行中</div>
              <button
                className="btn-primary btn-sm"
                onClick={() => {
                  refetchComments();
                  setPollStatus('polling');
                  setTimeout(() => setPollStatus('done'), 60000);
                }}
              >
                🔄 刷新查看
              </button>
            </>
          )}
          {pollStatus === 'idle' && (
            <div>AI 正在分析您的问题，回答将在稍后自动出现...</div>
          )}
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

      {/* Extracted memories for resolved threads */}
      {(thread.status === 'RESOLVED' || thread.status === 'TIMEOUT_CLOSED') && (
        <ThreadMemories threadId={threadId} isAdmin={isAdmin} />
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

function ThreadMemories({ threadId, isAdmin }) {
  const { data, loading, refetch } = useAsync(
    () => memoryApi.list({ source_id: threadId, size: 50 }),
    [threadId]
  );
  const memories = data?.items || [];
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (loading || memories.length === 0) return null;

  async function handleSave(memoryId) {
    try {
      await memoryApi.update(memoryId, { content: editContent });
      setEditingId(null);
      refetch();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  }

  async function handleDelete() {
    try {
      await memoryApi.delete(deleteTarget);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        提取的知识记忆 ({memories.length})
      </h3>
      {memories.map(mem => (
        <div key={mem.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
          {editingId === mem.id ? (
            <div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                style={{ marginBottom: 12, minHeight: 100 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={() => handleSave(mem.id)}>保存</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                {mem.content}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {mem.knowledge_type && <KnowledgeTypeBadge type={mem.knowledge_type} />}
                {mem.authority === 'LOCKED' && <AuthorityBadge authority={mem.authority} />}
                {mem.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
                <QualityDot score={mem.quality_score} />
                {isAdmin && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => { setEditingId(mem.id); setEditContent(mem.content); }}
                    >
                      编辑
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => setDeleteTarget(mem.id)}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <ConfirmModal
        open={!!deleteTarget}
        title="删除记忆"
        message="确认删除此条知识记忆？删除后可在管理后台恢复。"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
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

      <MarkdownContent content={comment.content} style={{ fontSize: 14 }} />

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
              {comment.rag_context && (() => {
                let chunks = [];
                let isLegacyText = false;
                try {
                  const parsed = typeof comment.rag_context === 'string'
                    ? JSON.parse(comment.rag_context)
                    : comment.rag_context;
                  chunks = Array.isArray(parsed) ? parsed : [];
                } catch {
                  // 旧格式：纯文本，包装成单条展示
                  isLegacyText = true;
                  chunks = [{ text: comment.rag_context, metadata: {} }];
                }
                if (chunks.length === 0) return null;
                const isUrl = (s) => /^https?:\/\//i.test(s);
                return (
                  <div style={{
                    marginTop: citedMemories?.length > 0 ? 10 : 0,
                    paddingTop: citedMemories?.length > 0 ? 10 : 0,
                    borderTop: citedMemories?.length > 0 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6 }}>
                      📚 知识库参考{isLegacyText ? '' : `（${chunks.length} 条）`}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {chunks.map((chunk, idx) => {
                        const title = chunk?.metadata?.extended_metadata?.title || chunk?.metadata?.source || `片段 ${idx + 1}`;
                        const source = chunk?.metadata?.source || '';
                        const text = chunk?.text || '';
                        return (
                          <div key={idx} style={{
                            padding: '8px 10px',
                            background: 'var(--bg)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>#{idx + 1}</span>
                              {isUrl(source) ? (
                                <a href={source} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
                                  title={source}
                                >
                                  {title}↗
                                </a>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-sec)', whiteSpace: 'pre-wrap' }}>
                              {text.length > 200 ? text.slice(0, 200) + '…' : text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
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
