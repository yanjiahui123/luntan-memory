import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { threadApi } from '../api/client';
import ImagePasteTextarea from '../components/ImagePasteTextarea';
import { TagChipsInput } from '../components/UI';

export default function NewThread() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', content: '', tags: '', environment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = {
        namespace_id: boardId,
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        environment: form.environment || null,
      };
      const thread = await threadApi.create(data);
      navigate(`/threads/${thread.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span>
        <Link to={`/boards/${boardId}/threads`}>帖子列表</Link> <span>›</span>
        <span>发帖</span>
      </div>

      <h1 className="page-title" style={{ marginBottom: 20 }}>提一个问题</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>标题 *</label>
          <input placeholder="简要描述你的问题" value={form.title} onChange={e => update('title', e.target.value)} required />
        </div>

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
