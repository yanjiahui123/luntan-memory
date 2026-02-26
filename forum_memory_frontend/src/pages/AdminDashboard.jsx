import React from 'react';
import { Link } from 'react-router-dom';
import { namespaceApi, memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg } from '../components/UI';

export default function AdminDashboard() {
  const { data: boards, loading, error } = useAsync(() => namespaceApi.list());
  const { data: memories } = useAsync(() => memoryApi.list({ page: 1, size: 1 }));

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>管理仪表盘</h1>

      {/* Stat cards */}
      <div className="stat-grid">
        <StatCard label="板块总数" value={boards?.length || 0} sub="全部板块" color="var(--accent)" />
        <StatCard label="AI 解决率" value="--%" sub="需要统计数据" color="var(--green)" />
        <StatCard label="待处理事项" value="--" sub="查看详情" color="var(--red)" link="/admin/pending" />
        <StatCard label="记忆总数" value={memories?.length || '--'} sub="全部记忆" color="var(--purple)" link="/admin/memories" />
      </div>

      {/* Two columns */}
      <div className="two-col">
        {/* Boards overview */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>板块概览</h3>
          {boards?.length === 0 ? (
            <p style={{ color: 'var(--text-ter)', fontSize: 13 }}>还没有板块</p>
          ) : (
            boards?.map(b => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{b.display_name}</span>
                <span style={{ color: 'var(--text-ter)' }}>{b.name}</span>
              </div>
            ))
          )}
        </div>

        {/* Quick actions */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚡ 快速操作</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to="/admin/pending" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>📋 处理待审事项</span> <span>→</span>
              </div>
            </Link>
            <Link to="/admin/memories" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>🧠 管理记忆库</span> <span>→</span>
              </div>
            </Link>
            <Link to="/admin/settings" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>⚙️ 板块配置</span> <span>→</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, link }) {
  const inner = (
    <div className="card stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value" style={{ color }}>{value}</div>
      <div className="stat-card__sub">{sub}</div>
    </div>
  );
  return link ? <Link to={link} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}
