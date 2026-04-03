import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inviteApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg } from '../components/UI';

export default function JoinBoard() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [done, setDone] = useState(false);

  const { data: info, loading, error } = useAsync(
    () => inviteApi.getInfo(code!),
    [code],
  );

  async function handleJoin() {
    if (!code) return;
    setJoining(true);
    setErrMsg('');
    try {
      const result = await inviteApi.join(code);
      setDone(true);
      setTimeout(() => navigate(`/boards/${result.namespace_id}/threads`), 1500);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!info) return <ErrorMsg message="邀请链接无效" />;

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center' }}>
      <div className="card" style={{ padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>加入板块</h2>
        <p style={{ fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>{info.namespace_display_name}</p>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 24 }}>
          角色: {info.role === 'moderator' ? '管理员' : '成员'}
          {info.expires_at && <> · 有效期至 {new Date(info.expires_at).toLocaleDateString()}</>}
        </p>

        {done ? (
          <p style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>加入成功，正在跳转...</p>
        ) : (
          <button className="btn-primary" onClick={handleJoin} disabled={joining} style={{ width: '100%' }}>
            {joining ? '加入中...' : '加入板块'}
          </button>
        )}
        {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{errMsg}</p>}
      </div>
    </div>
  );
}
