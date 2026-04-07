import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareLinkApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useFollow } from '../contexts/FollowContext';
import { Loading, ErrorMsg } from '../components/UI';

export default function JoinShareLink() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { refetchFollowed } = useFollow();
  const [joining, setJoining] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [done, setDone] = useState(false);

  const { data: info, loading, error } = useAsync(
    () => shareLinkApi.getInfo(code!),
    [code],
  );

  async function handleJoin() {
    if (!code) return;
    setJoining(true);
    setErrMsg('');
    try {
      await shareLinkApi.join(code);
      setDone(true);
      refetchFollowed();
      setTimeout(() => navigate('/boards'), 1500);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!info) return <ErrorMsg message="分享链接无效" />;

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>加入板块</h2>
        <p style={{ fontSize: 15, color: 'var(--text-sec)', marginBottom: 16 }}>{info.name}</p>

        <div style={{ textAlign: 'left', marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 8 }}>
            包含 {info.namespaces.length} 个板块：
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {info.namespaces.map(ns => (
              <li key={ns.namespace_id} style={{ fontSize: 14, marginBottom: 4, color: 'var(--text)' }}>
                {ns.display_name}
              </li>
            ))}
          </ul>
        </div>

        {done ? (
          <p style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>
            已加入 {info.namespaces.length} 个板块，正在跳转...
          </p>
        ) : (
          <button className="btn-primary" onClick={handleJoin} disabled={joining} style={{ width: '100%' }}>
            {joining ? '加入中...' : `加入全部 ${info.namespaces.length} 个板块`}
          </button>
        )}
        {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{errMsg}</p>}
      </div>
    </div>
  );
}
