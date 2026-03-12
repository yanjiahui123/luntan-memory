import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../api/client';
import { useUser } from '../contexts/UserContext';
import { Loading } from '../components/UI';
import type { ImportResult, ImportJobDetail } from '../types';

// ─── Result display ──────────────────────────────────────────────────────────

interface ResultRow {
  label: string;
  key: keyof ImportResult;
  icon: string;
  color?: string;
}

function ResultPanel({ result }: { result: ImportResult }) {
  const rows: ResultRow[] = [
    { label: 'JSON 文件总数', key: 'total', icon: '📄' },
    { label: '成功导入', key: 'imported', icon: '✅', color: 'var(--green)' },
    { label: '跳过（已存在）', key: 'skipped', icon: '⏭️', color: 'var(--text-sec)' },
    { label: '导入失败', key: 'failed', icon: '❌', color: 'var(--red)' },
    { label: '已解决帖子', key: 'resolved', icon: '🔒' },
    { label: '记忆提取成功', key: 'extracted', icon: '🧠', color: 'var(--purple)' },
    { label: '记忆提取失败', key: 'extract_failed', icon: '⚠️', color: 'var(--amber)' },
  ];

  const hasError = (result.failed ?? 0) > 0 || (result.extract_failed ?? 0) > 0;

  return (
    <div className="card fade-in" style={{ padding: 20, marginTop: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasError ? '⚠️' : '✅'} 导入完成
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {rows.map(({ label, key, icon, color }) => (
          <div key={key} style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 4 }}>{icon} {label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)' }}>
              {(result[key] as number) ?? 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Running job progress panel ──────────────────────────────────────────────

function JobProgressPanel({ job }: { job: ImportJobDetail }) {
  const elapsed = job.finished_at
    ? Math.round((new Date(job.finished_at).getTime() - new Date(job.created_at).getTime()) / 1000)
    : Math.round((Date.now() - new Date(job.created_at).getTime()) / 1000);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedLabel = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

  const statusConfig: Record<string, { icon: string; label: string; color: string }> = {
    pending: { icon: '⏳', label: '等待开始…', color: 'var(--text-sec)' },
    running: { icon: '🔄', label: '正在导入中…', color: 'var(--accent)' },
    done:    { icon: '✅', label: '导入完成', color: 'var(--green)' },
    error:   { icon: '❌', label: '导入出错', color: 'var(--red)' },
  };
  const cfg = statusConfig[job.status] ?? statusConfig.pending;

  return (
    <div className="card fade-in" style={{ padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
        <div>
          <div style={{ fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-ter)', marginTop: 2 }}>
            任务 ID：{job.job_id.slice(0, 8)}… · 已用时 {elapsedLabel} · 共 {job.total_files} 个文件
          </div>
        </div>
      </div>

      {job.status === 'running' && (
        <div style={{ fontSize: 12, color: 'var(--text-sec)', padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
          💡 大量文件包含记忆提取（LLM 调用）时需要较长时间，请耐心等待。你可以离开此页面，任务会在后台继续运行。
        </div>
      )}

      {job.status === 'error' && job.error && (
        <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'var(--red-light, #fff0f0)', borderRadius: 'var(--radius)' }}>
          错误详情：{job.error}
        </div>
      )}
    </div>
  );
}

// ─── Drop zone ───────────────────────────────────────────────────────────────

interface FileDropZoneProps {
  files: File[];
  onChange: React.Dispatch<React.SetStateAction<File[]>>;
}

function FileDropZone({ files, onChange }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const arr = Array.from(newFiles).filter(
      f => f.name.endsWith('.json') || f.name.endsWith('.zip')
    );
    if (arr.length === 0) return;
    onChange(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(name: string) {
    onChange(prev => prev.filter(f => f.name !== name));
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const sizeLabel = totalSize > 1024 * 1024
    ? `${(totalSize / 1024 / 1024).toFixed(1)} MB`
    : `${(totalSize / 1024).toFixed(0)} KB`;

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--accent-light)' : 'var(--surface-alt)',
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>点击选择或拖拽文件到此处</div>
        <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>
          支持多个 <strong>.json</strong> 文件，或包含 JSON 的 <strong>.zip</strong> 压缩包
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".json,.zip"
        multiple
        style={{ display: 'none' }}
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />

      {files.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              已选择 {files.length} 个文件（{sizeLabel}）
            </span>
            <button
              className="btn-sm btn-secondary"
              onClick={() => onChange([])}
              style={{ fontSize: 11 }}
            >
              清空
            </button>
          </div>
          <div style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 12,
          }}>
            {files.map(f => (
              <div key={f.name} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderBottom: '1px solid var(--border)',
                gap: 8,
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name.endsWith('.zip') ? '🗜️' : '📄'} {f.name}
                </span>
                <span style={{ color: 'var(--text-ter)', flexShrink: 0 }}>
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  className="btn-sm"
                  onClick={() => removeFile(f.name)}
                  style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5_000; // 每 5 秒轮询一次

export default function ImportTopics() {
  const { boardId: routeBoardId } = useParams<{ boardId: string }>();
  const { isSuperAdmin, myNamespaces: boards, loading: userLoading } = useUser();

  const [namespaceId, setNamespaceId] = useState(routeBoardId || '');
  const [files, setFiles] = useState<File[]>([]);
  const [workers, setWorkers] = useState(4);
  const [skipExtraction, setSkipExtraction] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  // 上传阶段状态
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 异步任务状态
  const [job, setJob] = useState<ImportJobDetail | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理轮询定时器
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // 启动轮询
  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await adminApi.importJobStatus(jobId);
        setJob(status);
        if (status.status === 'done' || status.status === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {
        // 轮询失败时不中断，继续重试
      }
    }, POLL_INTERVAL);
  }

  async function handleImport() {
    if (!namespaceId) { setUploadError('请选择目标板块'); return; }
    if (files.length === 0) { setUploadError('请选择要导入的文件'); return; }
    setUploadError(null);
    setJob(null);
    setUploading(true);
    try {
      const jobInfo = await adminApi.importTopicsUpload(namespaceId, files, {
        workers,
        skipExtraction,
        dryRun,
      });
      // 构造初始 job 状态并开始轮询
      const initialJob: ImportJobDetail = {
        ...jobInfo,
        result: null,
        error: null,
        finished_at: null,
      };
      setJob(initialJob);
      setFiles([]); // 清空文件选择，避免重复提交
      startPolling(jobInfo.job_id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (userLoading) return <Loading />;

  const isRunning = job?.status === 'pending' || job?.status === 'running';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/admin">管理仪表盘</Link> <span>›</span>
        <span>批量导入帖子</span>
      </div>

      <h1 className="page-title" style={{ marginBottom: 4 }}>批量导入历史帖子</h1>
      <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>
        将历史帖子 JSON 文件导入到指定板块，已解决的帖子将自动提取知识到记忆库。
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        {/* Board selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            目标板块 *
          </label>
          <select value={namespaceId} onChange={e => setNamespaceId(e.target.value)} disabled={isRunning}>
            <option value="">-- 请选择板块 --</option>
            {boards?.map(b => (
              <option key={b.id} value={b.id}>{b.display_name || b.name}</option>
            ))}
          </select>
          {!isSuperAdmin && (
            <div style={{ fontSize: 11, color: 'var(--text-ter)', marginTop: 4 }}>
              仅显示您有管理权限的板块
            </div>
          )}
        </div>

        {/* File drop zone */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            选择文件 *
          </label>
          <FileDropZone files={files} onChange={setFiles} />
        </div>

        {/* Options */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>导入选项</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Workers */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                🔀 记忆提取并发数：<strong>{workers}</strong>
              </label>
              <input
                type="range" min={1} max={8} step={1}
                value={workers}
                onChange={e => setWorkers(Number(e.target.value))}
                style={{ width: '100%' }}
                disabled={isRunning}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-ter)', marginTop: 2 }}>
                <span>1（稳定）</span><span>8（最快）</span>
              </div>
            </div>

            {/* Toggles */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={skipExtraction}
                  onChange={e => setSkipExtraction(e.target.checked)}
                  disabled={isRunning}
                />
                <span>
                  <strong>跳过记忆提取</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-sec)' }}>仅导入帖子，不提取知识</div>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={e => setDryRun(e.target.checked)}
                  disabled={isRunning}
                />
                <span>
                  <strong>演练模式</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-sec)' }}>解析文件但不写入数据库</div>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Upload error */}
        {uploadError && (
          <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'var(--red-light, #fff0f0)', borderRadius: 'var(--radius)' }}>
            ❌ {uploadError}
          </div>
        )}

        {/* Hint for dry run */}
        {dryRun && (
          <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
            💡 演练模式已开启，不会写入数据库，可安全预览导入内容
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            className="btn-primary"
            onClick={handleImport}
            disabled={uploading || isRunning || !namespaceId || files.length === 0}
          >
            {(() => { if (uploading) return '上传中…'; if (dryRun) return '🔍 演练预览'; return '🚀 开始导入'; })()}
          </button>
          {uploading && (
            <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
              正在上传文件，请稍候…
            </span>
          )}
          {isRunning && (
            <span style={{ fontSize: 12, color: 'var(--accent)' }}>
              ⏳ 后台导入中，每 5 秒自动刷新状态…
            </span>
          )}
          {(isDone || isError) && (
            <button
              className="btn-sm btn-secondary"
              onClick={() => { setJob(null); setUploadError(null); }}
            >
              重新导入
            </button>
          )}
        </div>
      </div>

      {/* Job progress / result */}
      {job && !isDone && <JobProgressPanel job={job} />}
      {isDone && job?.result && <ResultPanel result={job.result} />}

      {/* Notes */}
      <div className="card" style={{ padding: 16, marginTop: 16, fontSize: 12, color: 'var(--text-sec)' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>📝 注意事项</div>
        <ul style={{ paddingLeft: 16, lineHeight: 2 }}>
          <li>文件命名格式：<code>简要描述_帖子id_topic.json</code>，系统自动解析标题</li>
          <li>重复导入同一帖子会自动跳过（通过 topic_id 去重）</li>
          <li>有最佳回答 (<code>best_answer_url</code> 或 <code>is_solution:true</code>) 的帖子会标记为已解决并提取知识</li>
          <li><code>topic_closed:true</code> 但无最佳回答的帖子标记为超时关闭</li>
          <li>并发数越高导入越快，但对 LLM API 的调用量也越大</li>
          <li>大批量导入（数百篇以上）时，任务在后台运行，<strong>可关闭此页面</strong>，服务重启前结果均可查</li>
        </ul>
      </div>
    </div>
  );
}
