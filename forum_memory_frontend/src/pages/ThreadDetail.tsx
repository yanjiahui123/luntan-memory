import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { threadApi, feedbackApi, memoryApi, namespaceApi } from '../api/client';

const API_BASE = import.meta.env.VITE_APP_API_BASE_URL ?? '';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, StatusBadge, Badge, TimeAgo, ConfirmModal, KnowledgeTypeBadge, QualityDot, AuthorityBadge } from '../components/UI';
import ImagePasteTextarea from '../components/ImagePasteTextarea';
import type { Thread, Comment, Memory, FeedbackType, RagChunk } from '../types';

const mdComponents = {
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const resolvedSrc = src?.startsWith('/uploads/') ? `${API_BASE}${src}` : src;
    return <img src={resolvedSrc} alt={alt} style={{ maxWidth: '100%' }} {...props} />;
  },
};

function MarkdownContent({ content, style }: { content: string; style?: React.CSSProperties }) {
  if (!content) return null;
  return (
    <div className="md-body" style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
    </div>
  );
}

function CollapsibleContent({ content, maxHeight }: { content: string; maxHeight: number }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!innerRef.current) return;
    setNeedsCollapse(innerRef.current.scrollHeight > maxHeight);
  }, [content, maxHeight]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={innerRef}
        style={{
          maxHeight: !needsCollapse || expanded ? 'none' : maxHeight,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <MarkdownContent content={content} style={{ fontSize: 14 }} />
      </div>
      {needsCollapse && !expanded && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
          background: 'linear-gradient(transparent, var(--bg-card, #fff))',
          pointerEvents: 'none',
        }} />
      )}
      {needsCollapse && (
        <button
          className="btn-sm btn-secondary"
          onClick={() => setExpanded(!expanded)}
          style={{ display: 'block', margin: '8px auto 0', fontSize: 12 }}
        >
          {expanded ? '收起 ▴' : '展开全文 ▾'}
        </button>
      )}
    </div>
  );
}

export default function ThreadDetail() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const { data: thread, loading, error, refetch } = useAsync(() => threadApi.get(threadId!), [threadId]);
  const { data: board } = useAsync(() => thread ? namespaceApi.get(thread.namespace_id) : Promise.resolve(null), [thread?.namespace_id]);
  const { data: comments, refetch: refetchComments } = useAsync(() => threadApi.comments(threadId!), [threadId]);
  const { currentUser, isSuperAdmin, myNamespaces } = useUser();
  const { addToast } = useToast();
  const isAuthor = !!(currentUser && thread?.author_id && currentUser.id === thread.author_id);
  // Admin of THIS board: super admin, or board admin managing this board's namespace
  const isCurrentBoardAdmin = isSuperAdmin || !!(myNamespaces?.some(ns => ns.id === thread?.namespace_id));
  const canDelete = isAuthor || isCurrentBoardAdmin;
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [streamPhase, setStreamPhase] = useState<'idle' | 'searching' | 'generating' | 'done'>('idle');
  const [streamingContent, setStreamingContent] = useState('');
  const esRef = useRef<EventSource | null>(null);
  const viewRecorded = useRef(false);
  const autoConnectAttempted = useRef(false);

  // Record view once per page visit (ref guard prevents StrictMode double-fire)
  useEffect(() => {
    if (!threadId || viewRecorded.current) return;
    viewRecorded.current = true;
    threadApi.recordView(threadId).catch(() => {});
  }, [threadId]);

  async function handleReply() {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      await threadApi.addComment(threadId!, replyText, replyTarget?.id);
      setReplyText('');
      setReplyTarget(null);
      refetchComments();
    } catch (err) {
      addToast('error', '回复失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReplying(false);
    }
  }

  async function handleAdopt(commentId: string) {
    if (adopting) return;
    setAdopting(true);
    try {
      await threadApi.adoptAnswer(threadId!, commentId);
      refetch();
      refetchComments();
    } catch (err) {
      addToast('error', '采纳失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAdopting(false);
    }
  }

  async function handleClose() {
    if (closing) return;
    setClosing(true);
    try {
      await threadApi.close(threadId!);
      setShowCloseConfirm(false);
      refetch();
    } catch (err) {
      addToast('error', '关闭失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setClosing(false);
    }
  }

  async function handleReopen() {
    if (reopening) return;
    setReopening(true);
    try {
      await threadApi.reopen(threadId!);
      refetch();
    } catch (err) {
      addToast('error', '重新开启失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReopening(false);
    }
  }

  const isProd = import.meta.env.MODE === 'production';
  const isBeta = import.meta.env.MODE === 'beta';

  const prefix = (() => {
    if (isProd) {
      return 'https://ai.libing.yjh.com/forum_memory/api';
    } else if (isBeta) {
      return 'https://ai-test.libing.yjh.com/forum_memory_beta/api';
    }
    return '/api';
  })();

  function connectStream(force = false) {
    if (esRef.current) esRef.current.close();
    setStreamingContent('');
    setStreamPhase(force ? 'searching' : 'idle');
    setAiLoading(true);
    const params = new URLSearchParams();
    if (force) params.set('force', 'true');
    const qs = params.toString() ? `?${params}` : '';
    const streamUrl = `${prefix}/threads/${threadId}/ai-answer/stream${qs}`;
    const es = new EventSource(streamUrl);
    esRef.current = es;
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.skipped) {
          es.close();
          esRef.current = null;
          setStreamPhase('done');
          setAiLoading(false);
          refetchComments();
        } else if (msg.phase === 'searching') {
          setStreamPhase('searching');
        } else if (msg.phase === 'generating') {
          setStreamPhase('generating');
        } else if (msg.token) {
          setStreamingContent(prev => prev + msg.token);
        } else if (msg.done) {
          es.close();
          esRef.current = null;
          setAiLoading(false);
          // 保持 generating 状态直到 refetch 完成，避免内容闪烁
          refetchComments().then(() => setStreamPhase('done'));
        } else if (msg.error) {
          es.close();
          esRef.current = null;
          setStreamPhase('done');
          setAiLoading(false);
          addToast('error', 'AI 回答生成失败: ' + msg.error);
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
      setStreamPhase('done');
      setAiLoading(false);
    };
  }

  function handleRegenerate() {
    if (aiLoading) return;
    setStreamingContent('');
    connectStream(true); // force=true to regenerate
  }

  // Detect placeholder AI comment (means AI is generating in background)
  const AI_PLACEHOLDER = '<!-- ai_generating -->';
  const hasPlaceholderAi = !!(comments?.some(c => c.is_ai && c.content === AI_PLACEHOLDER));

  // Auto-connect streaming for:
  // - new threads with no comments (first generation)
  // - placeholder exists (generation in progress, resume via SSE)
  useEffect(() => {
    if (thread?.status !== 'OPEN') return;
    if (autoConnectAttempted.current) return;
    const noComments = (thread?.comment_count ?? 0) === 0;
    if (!noComments && !hasPlaceholderAi) return;
    autoConnectAttempted.current = true;
    connectStream();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [thread?.id, hasPlaceholderAi]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!thread) return null;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span>
        <Link to={`/boards/${thread.namespace_id}/threads`}>{board?.display_name || board?.name || '...'}</Link> <span>›</span>
        <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{thread.title}</span>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <StatusBadge status={thread.status} />
          {thread.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
          {thread.environment && <Badge type="gray">🌍 {thread.environment}</Badge>}
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{thread.title}</h1>
        <MarkdownContent content={thread.content} style={{ fontSize: 14, color: 'var(--text)' }} />
        <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 12, color: 'var(--text-ter)', alignItems: 'center' }}>
          {thread.author_display_name && <span>👤 {thread.author_display_name}</span>}
          <span>👁 {thread.view_count} 浏览</span>
          <span>💬 {thread.comment_count} 回复</span>
          <TimeAgo date={thread.created_at} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {canDelete && thread.status === 'OPEN' && (
              <button className="btn-sm btn-secondary" onClick={() => setShowCloseConfirm(true)}>
                关闭帖子
              </button>
            )}
            {canDelete && (thread.status === 'RESOLVED' || thread.status === 'CLOSED' || thread.status === 'TIMEOUT_CLOSED') && (
              <button className="btn-sm btn-secondary" disabled={reopening} onClick={handleReopen}>
                {reopening ? '开启中...' : '重新开启'}
              </button>
            )}
            {canDelete && thread.status !== 'DELETED' && (
              <button className="btn-sm btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                删除帖子
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>回答 ({comments?.length || 0})</h3>
        {thread.status === 'OPEN' && (isAuthor || isCurrentBoardAdmin) && comments?.some(c => c.is_ai) && (
          <button
            className="btn-secondary"
            disabled={aiLoading}
            onClick={handleRegenerate}
          >
            {aiLoading ? '生成中...' : '🤖 重新生成 AI 回答'}
          </button>
        )}
      </div>

      {/* Streaming AI answer card */}
      {(streamPhase === 'searching' || streamPhase === 'generating') && (
        <StreamingAiComment phase={streamPhase} content={streamingContent} />
      )}

      {/* Connecting / placeholder message */}
      {thread.status === 'OPEN' && streamPhase === 'idle' && (aiLoading || hasPlaceholderAi) && (
        <div className="card" style={{ padding: 16, marginBottom: 12, textAlign: 'center', color: 'var(--text-sec)', fontSize: 13 }}>
          <div style={{ color: 'var(--text-ter)' }}>
            {aiLoading ? '正在连接 AI 服务...' : '🤖 AI 正在生成回答，请稍候...'}
          </div>
        </div>
      )}

      {comments?.filter(c => {
        // Hide old AI comment while streaming a new one (regeneration)
        if ((streamPhase === 'searching' || streamPhase === 'generating') && c.is_ai) return false;
        // Hide placeholder AI comment (generation in progress)
        if (c.is_ai && c.content === AI_PLACEHOLDER) return false;
        return true;
      }).map(c => (
        <CommentCard key={c.id} comment={c} thread={thread} onAdopt={() => handleAdopt(c.id)} onDelete={refetchComments} isAdmin={isCurrentBoardAdmin} canAdopt={isAuthor || isCurrentBoardAdmin} onReply={() => setReplyTarget(c)} />
      ))}

      {thread.status === 'OPEN' && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          {replyTarget && (
            <div className="reply-target-bar">
              <span>回复 @{replyTarget.is_ai ? 'AI 助手' : (replyTarget.author_display_name || '用户')}</span>
              <button className="reply-target-bar__close" onClick={() => setReplyTarget(null)}>✕</button>
            </div>
          )}
          <ImagePasteTextarea placeholder={replyTarget ? `回复 @${replyTarget.is_ai ? 'AI 助手' : (replyTarget.author_display_name || '用户')}...` : '写下你的回答... (支持粘贴图片和 Markdown)'} value={replyText} onChange={setReplyText} onUploadError={msg => addToast('error', `图片上传失败: ${msg}`)} style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleReply} disabled={!replyText.trim() || replying}>{replying ? '发送中...' : '发送回复'}</button>
          </div>
        </div>
      )}

      {(thread.status === 'RESOLVED' || thread.status === 'CLOSED' || thread.status === 'TIMEOUT_CLOSED') && (
        <ThreadMemories threadId={threadId!} isAdmin={isCurrentBoardAdmin} />
      )}

      <ConfirmModal
        open={showCloseConfirm}
        title="关闭帖子"
        message={
          thread.best_answer_id
            ? '该帖子已有采纳答案，关闭后将标记为"已解决"并触发记忆提取。发帖人和管理员可以重新开启。'
            : '确认关闭此帖子？帖子将标记为"已关闭"（无采纳答案），发帖人和管理员可以重新开启。'
        }
        onConfirm={handleClose}
        onCancel={() => setShowCloseConfirm(false)}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除帖子"
        message={
          isCurrentBoardAdmin
            ? '确认删除此帖子？帖子将不再显示，关联记忆将标记为"待人工审核"，请前往待处理中心确认是否保留。'
            : '确认删除此帖子？帖子将不再显示，从中提取的知识记忆也将一并删除。'
        }
        onConfirm={async () => {
          await threadApi.delete(threadId!);
          setShowDeleteConfirm(false);
          navigate(`/boards/${thread.namespace_id}/threads`);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function StreamingAiComment({ phase, content }: { phase: string; content: string }) {
  const phaseLabel = phase === 'searching' ? '🔍 搜索知识中...' : '✍️ 生成中...';
  return (
    <div className="card comment-box comment-box--ai" style={{ marginBottom: 12 }}>
      <div className="comment-author">
        <div className="comment-avatar" style={{ background: 'var(--purple-light)', color: 'var(--purple)' }}>
          🤖
        </div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI 助手</span>
        <Badge type="purple">自动回复</Badge>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)' }}>
          {phaseLabel}
        </span>
      </div>
      {content ? (
        <div className="md-body streaming-content" style={{ fontSize: 14 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          <span className="streaming-cursor" />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-sec)', padding: '8px 0' }}>
          {phase === 'searching' ? '正在搜索相关知识记忆和知识库...' : '正在组织回答...'}
        </div>
      )}
    </div>
  );
}

function ThreadMemories({ threadId, isAdmin }: { threadId: string; isAdmin: boolean }) {
  const { addToast } = useToast();
  const { data, loading, refetch } = useAsync(
    () => memoryApi.list({ source_id: threadId, size: 50 } as Parameters<typeof memoryApi.list>[0]),
    [threadId]
  );
  const memories = data?.items || [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (loading) return (
    <div style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-sec)', fontSize: 13 }}>
      <Badge type="blue">⏳ 正在检查知识提取状态...</Badge>
    </div>
  );
  if (memories.length === 0) return (
    <div style={{ marginTop: 24, textAlign: 'center' }}>
      <Badge type="amber">📝 知识提取中或未产生记忆</Badge>
    </div>
  );

  async function handleSave(memoryId: string) {
    try {
      await memoryApi.update(memoryId, { content: editContent });
      setEditingId(null);
      refetch();
    } catch (err) {
      addToast('error', '保存失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await memoryApi.delete(deleteTarget);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      addToast('error', '删除失败: ' + (err instanceof Error ? err.message : String(err)));
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
              <ImagePasteTextarea value={editContent} onChange={setEditContent} onUploadError={msg => addToast('error', `图片上传失败: ${msg}`)} style={{ marginBottom: 12, minHeight: 100 }} />
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

const MEMORY_TRUNCATE = 120;
const RAG_TRUNCATE = 200;

/** Expandable cited memory item with per-memory feedback */
function CitedMemoryItem({ mem, index, isAdmin }: { mem: Memory; index: number; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackType | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const needsTruncate = mem.content.length > MEMORY_TRUNCATE;
  const displayText = !needsTruncate || expanded ? mem.content : mem.content.slice(0, MEMORY_TRUNCATE) + '...';

  useEffect(() => {
    feedbackApi.mine(mem.id)
      .then(res => { if (res.feedback_type) setFeedback(res.feedback_type); })
      .catch(() => {});
  }, [mem.id]);

  async function handleFeedback(type: FeedbackType) {
    if (fbLoading) return;
    setFbLoading(true);
    try {
      if (feedback === type) {
        await feedbackApi.withdraw(mem.id, { feedback_type: type });
        setFeedback(null);
      } else {
        if (feedback) {
          await feedbackApi.withdraw(mem.id, { feedback_type: feedback });
        }
        await feedbackApi.submit(mem.id, { feedback_type: type });
        setFeedback(type);
      }
    } catch { /* ignore */ } finally {
      setFbLoading(false);
    }
  }

  return (
    <div style={{ padding: '8px 0', borderTop: index > 0 ? '1px solid var(--border)' : 'none' }}>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {displayText}
      </div>
      {needsTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}
        >
          {expanded ? '收起 ▴' : '展开全文 ▾'}
        </button>
      )}
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
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button className={`btn-sm ${feedback === 'useful' ? 'btn-primary' : 'btn-secondary'}`} disabled={fbLoading} onClick={() => handleFeedback('useful')} style={{ fontSize: 11 }}>👍 有用</button>
        <button className={`btn-sm ${feedback === 'wrong' ? 'btn-danger' : 'btn-secondary'}`} disabled={fbLoading} onClick={() => handleFeedback('wrong')} style={{ fontSize: 11 }}>⚠️ 错误</button>
        <button className={`btn-sm ${feedback === 'outdated' ? 'btn-warning' : 'btn-secondary'}`} disabled={fbLoading} onClick={() => handleFeedback('outdated')} style={{ fontSize: 11 }}>📅 过时</button>
      </div>
    </div>
  );
}

/** Expandable RAG chunk item */
function RagChunkItem({ chunk, index }: { chunk: RagChunk; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const title = chunk?.metadata?.extended_metadata?.title || chunk?.metadata?.source || `片段 ${index + 1}`;
  const source = chunk?.metadata?.source || '';
  const text = chunk?.text || '';
  const needsTruncate = text.length > RAG_TRUNCATE;
  const displayText = !needsTruncate || expanded ? text : text.slice(0, RAG_TRUNCATE) + '...';
  const isSourceUrl = /^https?:\/\//i.test(source);

  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>#{index + 1}</span>
        {isSourceUrl ? (
          <a href={source} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
            title={source}
          >
            {title}↗
          </a>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{title as string}</span>
        )}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-sec)', whiteSpace: 'pre-wrap' }}>
        {displayText}
      </div>
      {needsTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}
        >
          {expanded ? '收起 ▴' : '展开全文 ▾'}
        </button>
      )}
    </div>
  );
}

interface CommentCardProps {
  comment: Comment;
  thread: Thread;
  onAdopt: () => void;
  onDelete: () => void;
  onReply: () => void;
  isAdmin: boolean;
  canAdopt: boolean;
}

function CommentCard({ comment, thread, onAdopt, onDelete, onReply, isAdmin, canAdopt }: CommentCardProps) {
  const { addToast } = useToast();
  const [upvotes, setUpvotes] = useState(comment.upvote_count || 0);
  const [upvoted, setUpvoted] = useState(false);
  const [citedMemories, setCitedMemories] = useState<Memory[] | null>(null);
  const [showCitations, setShowCitations] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAi = comment.is_ai;
  const isBest = comment.is_best_answer;
  const hasCitations = (comment.cited_memory_ids?.length ?? 0) > 0;

  async function handleDelete() {
    try {
      await threadApi.deleteComment(comment.thread_id, comment.id);
      setShowDeleteConfirm(false);
      onDelete();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // Lazy-load citations only on first expand (not on mount)
  const citationsLoaded = useRef(false);
  function loadCitationsIfNeeded() {
    if (citationsLoaded.current || !isAi || !hasCitations) return;
    citationsLoaded.current = true;
    memoryApi.batchGet(comment.cited_memory_ids)
      .then(setCitedMemories)
      .catch(err => {
        console.warn('Failed to load cited memories:', err);
        addToast('warning', '引用记忆加载失败');
        citationsLoaded.current = false; // Allow retry on next click
      });
  }

  async function handleUpvote() {
    try {
      const result = await threadApi.upvoteComment(comment.thread_id, comment.id) as Comment & { voted?: boolean };
      setUpvotes(result.upvote_count);
      setUpvoted(result.voted ?? false);
    } catch (err) {
      console.error('Upvote failed:', err);
    }
  }

  // Parse rag_context
  let ragChunks: RagChunk[] = [];
  let isLegacyText = false;
  if (comment.rag_context) {
    if (typeof comment.rag_context === 'string') {
      try {
        const parsed = JSON.parse(comment.rag_context) as unknown;
        ragChunks = Array.isArray(parsed) ? (parsed as RagChunk[]) : [];
      } catch {
        isLegacyText = true;
        ragChunks = [{ text: comment.rag_context, metadata: {} }];
      }
    } else if (Array.isArray(comment.rag_context)) {
      ragChunks = comment.rag_context as RagChunk[];
    }
  }
  const isUrl = (s: string) => /^https?:\/\//i.test(s);

  return (
    <div className={`card comment-box ${isAi ? 'comment-box--ai' : ''} ${isBest ? 'comment-box--best' : ''}`}>
      <div className="comment-author">
        <div className="comment-avatar" style={{ background: isAi ? 'var(--purple-light)' : 'var(--accent-light)', color: isAi ? 'var(--purple)' : 'var(--accent)' }}>
          {isAi ? '🤖' : (comment.author_display_name || comment.author_role)?.[0]?.toUpperCase() || 'U'}
        </div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {isAi ? 'AI 助手' : (comment.author_display_name || comment.author_role || '用户')}
        </span>
        {isAi && <Badge type="purple">自动回复</Badge>}
        {isBest && <Badge type="green">✓ 最佳回答</Badge>}
        {comment.author_role === 'admin' && <Badge type="amber">管理员</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-ter)' }}><TimeAgo date={comment.created_at} /></span>
      </div>

      {comment.reply_to_comment_id && (
        <div className="reply-quote">
          <div className="reply-quote__header">
            ↩ {comment.reply_to_author_display_name || '用户'}
          </div>
          {comment.reply_to_content_preview && (
            <div className="reply-quote__body">{comment.reply_to_content_preview}</div>
          )}
        </div>
      )}

      <CollapsibleContent content={comment.content} maxHeight={300} />

      {isAi && (hasCitations || comment.rag_context) && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn-sm btn-secondary"
            onClick={() => { if (!showCitations) loadCitationsIfNeeded(); setShowCitations(!showCitations); }}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            📎 引用了 {comment.cited_memory_ids?.length || 0} 条知识记忆
            {comment.rag_context ? ' + 📚知识库' : ''}
            {' '}{showCitations ? '▾' : '▸'}
          </button>

          {showCitations && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--purple-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              {citedMemories ? citedMemories.map((mem, i) => (
                <CitedMemoryItem key={mem.id} mem={mem} index={i} isAdmin={isAdmin} />
              )) : hasCitations && (
                <div style={{ fontSize: 12, color: 'var(--text-ter)', padding: '4px 0' }}>加载中...</div>
              )}

              {ragChunks.length > 0 && (
                <div style={{
                  marginTop: (citedMemories?.length ?? 0) > 0 ? 10 : 0,
                  paddingTop: (citedMemories?.length ?? 0) > 0 ? 10 : 0,
                  borderTop: (citedMemories?.length ?? 0) > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6 }}>
                    📚 知识库参考{isLegacyText ? '' : `（${ragChunks.length} 条）`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ragChunks.map((chunk, idx) => (
                      <RagChunkItem key={idx} chunk={chunk} index={idx} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {thread.status === 'OPEN' && !isBest && canAdopt && (
        <div style={{ padding: '10px 0 4px', borderTop: '1px solid var(--border)', marginTop: 10 }}>
          <button className="btn-success" onClick={onAdopt} style={{ width: '100%' }}>✓ 采纳此回答</button>
        </div>
      )}
      <div className="comment-actions" style={{ marginTop: thread.status === 'OPEN' && !isBest ? 6 : undefined }}>
        <button className={`btn-sm ${upvoted ? 'btn-primary' : 'btn-secondary'}`} onClick={handleUpvote}>
          👍 {upvotes}
        </button>
        {thread.status === 'OPEN' && (
          <button className="btn-sm btn-secondary" onClick={onReply}>💬 回复</button>
        )}
        <div style={{ flex: 1 }} />
        {isAdmin && !isBest && (
          <button className="btn-sm btn-danger" onClick={() => setShowDeleteConfirm(true)} style={{ fontSize: 11 }}>删除</button>
        )}
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除评论"
        message="确认删除此评论？如果帖子已解决，将重新提取知识记忆。"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
