import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { threadApi } from '../api/client';
import ImagePasteTextarea from '../components/ImagePasteTextarea';
import { TagChipsInput, StatusBadge } from '../components/UI';
import type { Thread } from '../types';

export default function NewThread() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', content: '', tags: '', environment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 相似问题拦截
  const [similar, setSimilar] = useState<Thread[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastQuery = useRef('');

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (field === 'title') setDismissed(false);
  }

  // debounced 搜索相似帖子
  useEffect(() => {
    const q = form.title.trim();
    if (q.length < 6 || dismissed) {
      setSimilar([]);
      return;
    }
    if (q === lastQuery.current) return;
    const timer = setTimeout(async () => {
      lastQuery.current = q;
      setSimilarLoading(true);
      try {
        const result = await threadApi.list({ namespace_id: boardId, q, size: 5 });
        setSimilar((result?.items || []).filter(t => t.status !== 'DELETED'));
      } catch {
        // 搜索失败静默处理，不影响发帖
      } finally {
        setSimilarLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.title, boardId, dismissed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = {
        namespace_id: boardId!,
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        environment: form.environment || null,
      } as Parameters<typeof threadApi.create>[0];
      const thread = await threadApi.create(data);
      navigate(`/threads/${thread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const sortedSimilar = [...similar].sort((a, b) =>
    (b.status === 'RESOLVED' ? 1 : 0) - (a.status === 'RESOLVED' ? 1 : 0)
  );
  const hasResolved = similar.some(t => t.status === 'RESOLVED');

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span>
        <Link to={`/boards/${boardId}/threads`}>帖子列表</Link> <span>›</span>
        <span>发帖</span>
      </div>

      <h1 className="page-title" style={{ marginBottom: 20 }}>提一个问题</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: similar.length > 0 && !dismissed ? 10 : 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>标题 *</label>
          <input
            placeholder="简要描述你的问题"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            required
          />
          {similarLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-ter)', marginTop: 6 }}>正在搜索相似问题...</div>
          )}
        </div>

        {sortedSimilar.length > 0 && !dismissed && (
          <div style={{
            marginBottom: 16,
            border: `1px solid ${hasResolved ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            background: hasResolved ? 'rgba(var(--green-rgb, 34,197,94), 0.04)' : 'var(--bg)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '9px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: hasResolved ? 'rgba(var(--green-rgb, 34,197,94), 0.06)' : 'var(--surface)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: hasResolved ? 'var(--green)' : 'var(--text-sec)' }}>
                {hasResolved ? '✓ 找到已解决的相似问题，可能不需要重复提问' : '💡 找到相似问题，供参考'}
              </span>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{ fontSize: 18, color: 'var(--text-ter)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 12px', lineHeight: 1 }}
                title="关闭，继续发帖"
              >
                ×
              </button>
            </div>
            {sortedSimilar.map((t, i) => (
              <div key={t.id} style={{
                padding: '10px 14px',
                borderBottom: i < sortedSimilar.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.title}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StatusBadge status={t.status} />
                    {t.author_display_name && (
                      <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>👤 {t.author_display_name}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>💬 {t.comment_count} 回复</span>
                  </div>
                </div>
                <a
                  href={`/threads/${t.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-sm btn-secondary"
                  style={{ textDecoration: 'none', flexShrink: 0, fontSize: 12 }}
                >
                  查看 →
                </a>
              </div>
            ))}
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{ fontSize: 12, color: 'var(--text-ter)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                以上都不是我的问题，继续发帖
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>详细描述 *</label>
          <ImagePasteTextarea placeholder="详细描述你遇到的问题，支持粘贴图片、Markdown 和代码块..." value={form.content} onChange={v => update('content', v)} style={{ minHeight: 160 }} required />
        </div>

        <div style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--text-sec)', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {showAdvanced ? '▾' : '▸'} 高级选项（标签、环境）
          </button>
          {showAdvanced && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>技术分类标签</label>
                <TagChipsInput value={form.tags} onChange={v => update('tags', v)} placeholder="按 Enter 添加标签" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>适用环境</label>
                <input placeholder="如: JDK17, K8s, 生产环境" value={form.environment} onChange={e => update('environment', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '发布中...' : '发布'}</button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>取消</button>
        </div>
      </form>
    </div>
  );
}
