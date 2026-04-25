import React, { useState, useEffect } from 'react';
import { TreeSelect } from 'antd';

interface DeptNode {
  name: string;
  deptCode: string;
  children?: DeptNode[] | null;
}

interface TreeNode {
  value: string;
  title: string;
  key: string;
  children?: TreeNode[];
}

interface DeptTreeSelectProps {
  onSelect: (deptCode: string) => void;
  placeholder?: string;
}

// 将部门数据转换为Ant Design TreeSelect需要的格式
const convertToTreeData = (deptList: DeptNode[]): TreeNode[] => {
  return deptList.map((dept) => ({
    value: dept.deptCode,
    title: dept.name,
    key: dept.deptCode,
    children: dept.children ? convertToTreeData(dept.children) : undefined
  }));
};

export const DeptTreeSelect: React.FC<DeptTreeSelectProps> = ({ onSelect, placeholder = "请选择部门" }) => {
  const [departments, setDepartments] = useState<TreeNode[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取部门数据
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_APP_BASE_URL}${import.meta.env.MODE === 'production'?'/portal-center':'/portal-center-test'}/auth/getAllDept`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const deptOptions = data.result || [];

        const treeData = convertToTreeData([deptOptions]);
        setDepartments(treeData);
      } catch (err) {
        setError('获取部门信息失败');
        console.error('Failed to fetch departments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDepartments();
  }, []);

  const handleSelect = (value: string) => {
    setSelectedDept(value);
    onSelect(value);
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  return (
    <TreeSelect
      treeData={departments}
      placeholder={placeholder}
      style={{ width: '100%' }}
      value={selectedDept}
      onChange={handleSelect}
      showSearch
      loading={loading}
    />
  );
};
