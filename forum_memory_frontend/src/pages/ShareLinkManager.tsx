import React, { useState } from 'react';
import { namespaceApi, shareLinkApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, EmptyState, Badge, ConfirmModal } from '../components/UI';
import type { BoardShareLink, Namespace } from '../types';

export default function ShareLinkManager() {
  const toast = useToast();
  const { data: links, loading, error, refetch } = useAsync(() => shareLinkApi.list());
  const { data: nsResult } = useAsync(() => namespaceApi.list(1, 200));
  const allNamespaces = nsResult?.items ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<BoardShareLink | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await shareLinkApi.revoke(revokeTarget.id);
      toast.addToast('success','已撤销');
      setRevokeTarget(null);
      refetch();
    } catch (err) {
      toast.addToast('error',err instanceof Error ? err.message : '撤销失败');
    } finally {
      setRevoking(false);
    }
  }

  function copyLink(code: string) {
    // 检测是否在 iframe 中
    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch (e) {
        // 跨域情况下访问 window.top 会抛出异常，但通常说明在 iframe 中
        return true;
      }
    })();

    // 根据是否在 iframe 中设置正确的基础 URL
    const isProd = import.meta.env.MODE === 'production';
    const baseUrl = isInIframe
      ? `${import.meta.env.VITE_PARENT_BASEURL}/tabs/forum?r=`
      : `${window.location.origin}${ isProd ? '/forum_memory' :'/forum_memory_beta'}/dashboard`;

    const url = `${baseUrl}/share/${code}`;
    navigator.clipboard.writeText(url).then(() => toast.addToast('success','已复制链接'));
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">分享链接管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ 创建分享链接</button>
      </div>

      {!links || links.length === 0 ? (
        <EmptyState icon="🔗" message="还没有分享链接" />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>名称</th>
                <th style={{ padding: '10px 12px' }}>板块</th>
                <th style={{ padding: '10px 12px' }}>使用次数</th>
                <th style={{ padding: '10px 12px' }}>状态</th>
                <th style={{ padding: '10px 12px' }}>创建时间</th>
                <th style={{ padding: '10px 12px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {links.map(lk => (
                <tr key={lk.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{lk.name}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {lk.namespaces.map(ns => (
                      <Badge key={ns.namespace_id} type="blue">{ns.display_name}</Badge>
                    ))}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{lk.use_count}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge type={lk.is_active ? 'green' : 'gray'}>
                      {lk.is_active ? '有效' : '已撤销'}
                    </Badge>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-sec)' }}>
                    {new Date(lk.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {lk.is_active && (
                      <>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 12, marginRight: 8 }}
                          onClick={() => copyLink(lk.code)}
                        >
                          复制链接
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 12, color: 'var(--danger)' }}
                          onClick={() => setRevokeTarget(lk)}
                        >
                          撤销
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateShareLinkModal
          allNamespaces={allNamespaces}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetch(); }}
        />
      )}

      <ConfirmModal
        open={!!revokeTarget}
        title="撤销分享链接"
        message={`确定撤销「${revokeTarget?.name}」？撤销后其他人将无法通过此链接加入板块。`}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
        loading={revoking}
      />
    </div>
  );
}

/* ── Create modal ──────────────────────────────── */

function CreateShareLinkModal({ allNamespaces, onClose, onCreated }: {
  allNamespaces: Namespace[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  const filtered = allNamespaces.filter(ns =>
    ns.is_active && ns.display_name.toLowerCase().includes(searchQ.toLowerCase()),
  );

  function toggle(nsId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(nsId)) next.delete(nsId);
      else next.add(nsId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.addToast('error','请输入链接名称'); return; }
    if (selectedIds.size === 0) { toast.addToast('error','请至少选择一个板块'); return; }
    setSubmitting(true);
    try {
      await shareLinkApi.create({ name: name.trim(), namespace_ids: [...selectedIds] });
      toast.addToast('success','分享链接已创建');
      onCreated();
    } catch (err) {
      toast.addToast('error',err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 300 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', padding: 24, width: 480, maxHeight: '80vh',
        overflowY: 'auto', zIndex: 301,
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>创建分享链接</h3>
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>链接名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：新人入职板块集合"
            style={{ width: '100%', padding: '8px 12px', fontSize: 13, marginBottom: 16 }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            选择板块 ({selectedIds.size} 已选)
          </label>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="搜索板块..."
            style={{ width: '100%', padding: '6px 12px', fontSize: 13, marginBottom: 8 }}
          />
          <div style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            maxHeight: 240, overflowY: 'auto', padding: 4,
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--text-sec)', textAlign: 'center' }}>无匹配板块</div>
            ) : (
              filtered.map(ns => (
                <label
                  key={ns.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', cursor: 'pointer', borderRadius: 4,
                    background: selectedIds.has(ns.id) ? 'var(--accent-bg, rgba(59,130,246,.08))' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(ns.id)}
                    onChange={() => toggle(ns.id)}
                  />
                  <span style={{ fontSize: 13 }}>{ns.display_name}</span>
                </label>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
