import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { memoryApi, feedbackApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, AuthorityBadge, LifecycleBadge, Badge, QualityDot, ConfirmModal, KnowledgeTypeBadge } from '../components/UI';
import type { MemoryAuthority, MemoryLifecycle } from '../types';

export default function MemoryDetail() {
  const { memoryId } = useParams<{ memoryId: string }>();
  const navigate = useNavigate();
  const { data: memory, loading, error, refetch } = useAsync(() => memoryApi.get(memoryId!), [memoryId]);
  const { data: fbSummary } = useAsync(
    () => feedbackApi.summary(memoryId!).catch(err => {
      console.warn('Failed to load feedback summary:', err);
      return null;
    }),
    [memoryId],
  );
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleSave() {
    await memoryApi.update(memoryId!, { content: editContent });
    setEditing(false);
    refetch();
  }

  async function handleAuthority(authority: MemoryAuthority) {
    await memoryApi.changeAuthority(memoryId!, { authority });
    refetch();
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      await memoryApi.restore(memoryId!);
      addToast('success', '记忆已恢复为 ACTIVE 状态');
      refetch();
    } catch (err: any) {
      addToast('error', err.message || '恢复失败');
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete() {
    await memoryApi.delete(memoryId!);
    setShowDelete(false);
    navigate('/admin/memories');
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!memory) return null;

  const lifecycleStatus = (memory.status || memory.lifecycle_status) as MemoryLifecycle | undefined;

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/admin/memories">记忆管理</Link> <span>›</span> <span>详情</span>
      </div>

      <div className="detail-layout">
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <AuthorityBadge authority={memory.authority} />
                {lifecycleStatus && <LifecycleBadge status={lifecycleStatus} />}
                {memory.pending_human_confirm && <Badge type="amber">⏳ 待确认</Badge>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(lifecycleStatus === 'COLD' || lifecycleStatus === 'ARCHIVED') && (
                  <button className="btn-primary btn-sm" onClick={handleRestore} disabled={restoring}>
                    {restoring ? '恢复中...' : '♻️ 恢复'}
                  </button>
                )}
                <button className="btn-secondary btn-sm" onClick={() => { setEditing(true); setEditContent(memory.content); }}>✏️ 编辑</button>
                <button className="btn-danger btn-sm" onClick={() => setShowDelete(true)}>🗑 删除</button>
              </div>
            </div>

            {editing ? (
              <div>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} style={{ marginBottom: 12, minHeight: 120 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary btn-sm" onClick={handleSave}>保存</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.8, padding: 14, background: 'var(--surface-alt)', borderRadius: 'var(--radius)', whiteSpace: 'pre-wrap' }}>
                {memory.content}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {memory.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
              {memory.environment && <Badge type="gray">🌍 {memory.environment}</Badge>}
              {memory.knowledge_type && <KnowledgeTypeBadge type={memory.knowledge_type} />}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>详细信息</h3>
            <InfoGrid items={[
              ['来源类型', memory.source_type],
              ['来源帖子', memory.source_id ? <Link to={`/threads/${memory.source_id}`}>{memory.source_id.slice(0, 8)}...</Link> : '手动创建'],
              ['回答者角色', memory.source_role],
              ['解决类型', memory.resolved_type],
              ['创建时间', new Date(memory.created_at).toLocaleString('zh-CN')],
              ['更新时间', new Date(memory.updated_at).toLocaleString('zh-CN')],
            ]} />
          </div>
        </div>

        <div className="detail-sidebar">
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>质量指标</h3>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}><QualityDot score={memory.quality_score} /></div>
            </div>
            <InfoGrid items={[
              ['👍 有用', memory.useful_count],
              ['👎 没用', memory.not_useful_count],
              ['⚠️ 错误', memory.wrong_count],
              ['🔍 检索', `${memory.retrieve_count} 次`],
            ]} />
            {fbSummary && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-sec)' }}>
                有用率: {((fbSummary.useful_ratio ?? 0) * 100).toFixed(0)}%
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>权威等级管理</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={memory.authority === 'LOCKED' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => handleAuthority('LOCKED')} disabled={memory.authority === 'LOCKED'}>
                🔒 LOCKED
              </button>
              <button className={memory.authority === 'NORMAL' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => handleAuthority('NORMAL')} disabled={memory.authority === 'NORMAL'}>
                🤖 NORMAL
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>来源溯源</h3>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div>📄 来源: {memory.source_type}</div>
              <div>👤 回答者: {memory.source_role}</div>
              <div>🏷 解决类型: {memory.resolved_type}</div>
              {memory.source_id && (
                <div>📎 <Link to={`/threads/${memory.source_id}`}>查看原帖</Link></div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal open={showDelete} title="删除记忆" message="确认删除此记忆？删除后可在回收站恢复。" onConfirm={handleDelete} onCancel={() => setShowDelete(false)} />
    </div>
  );
}

function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
      {items.map(([label, value], i) => (
        <React.Fragment key={i}>
          <span style={{ color: 'var(--text-sec)' }}>{label}</span>
          <span style={{ fontWeight: 500 }}>{value ?? '—'}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
